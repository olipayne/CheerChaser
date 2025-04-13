import { useState, useCallback, useMemo, useEffect } from 'react';
import L from 'leaflet'; // Import L for LatLng type hint
import GpxParser from 'gpxparser'; // Import GpxParser type
import MapComponent from '@/components/MapComponent';
import GpxUpload from '@/components/GpxUpload'; // Import GpxUpload
import PlannerSidebar from '@/components/PlannerSidebar'; // Import the new sidebar component
import * as Utils from '@/utils'; // Import utils as a namespace
import { lineIntersect, lineString, point, distance } from '@turf/turf';
import { LineString } from 'geojson';
import { Menu, X } from 'lucide-react'; // Import icons for toggle button
import { Button } from '@/components/ui/button'; // Import Button
import './App.css'; // Keep or modify App.css if needed

// Constants for heuristics
const AVG_WALKING_SPEED_MPS = 1.4; // meters per second (~5 km/h)
const AVG_CYCLING_SPEED_MPS = 5.5; // meters per second (~20 km/h)
const SPECTATOR_BUFFER_SECONDS = 60 * 10; // Increase buffer to 10 mins to account for crossing/parking/etc.
const COURSE_CROSSING_PENALTY_SECONDS = 60 * 5; // 5 min penalty

function App() {
  // State to hold the parsed GPX data
  const [gpxData, setGpxData] = useState<GpxParser | null>(null);
  const [runnerPace, setRunnerPace] = useState<string>(
    () => localStorage.getItem('cheerchaser-runnerPace') || ''
  );
  const [selectedSpots, setSelectedSpots] = useState<Set<number>>(new Set());
  const [markerPositions, setMarkerPositions] = useState<Map<number, L.LatLng>>(new Map());
  const [segmentTravelTimes, setSegmentTravelTimes] = useState<number[] | null>(null);
  const [travelProfile, setTravelProfile] = useState<Utils.TravelProfile>('walking');
  const [raceStartTime, setRaceStartTime] = useState<string>(
    () => localStorage.getItem('cheerchaser-raceStartTime') || ''
  );
  const [gpxCourseLine, setGpxCourseLine] = useState<LineString | null>(null);

  // Suggestion input state
  const [numSpotsToSuggest, setNumSpotsToSuggest] = useState<number>(3);
  const [suggestionStrategy, setSuggestionStrategy] = useState<Utils.SuggestionStrategy>('minTravel');
  const [skipFirstKm, setSkipFirstKm] = useState<number>(0); // Add state for skipping km

  // State for sidebar visibility on mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- Effects for saving to localStorage ---
  useEffect(() => {
    localStorage.setItem('cheerchaser-runnerPace', runnerPace);
    console.log("Saved runnerPace to localStorage:", runnerPace);
  }, [runnerPace]);

  useEffect(() => {
    localStorage.setItem('cheerchaser-raceStartTime', raceStartTime);
    console.log("Saved raceStartTime to localStorage:", raceStartTime);
  }, [raceStartTime]);
  // --- End Effects ---

  // Callback function to receive parsed GPX data from GpxUpload
  const handleGpxParsed = useCallback((data: GpxParser) => {
    console.log("GPX data parsed in App:", data);
    setGpxData(data);
    setSelectedSpots(new Set()); // Clear selected spots when new GPX is loaded
    setMarkerPositions(new Map()); // Clear positions when new GPX is loaded
    setSegmentTravelTimes(null); // Clear segment times
    // Create GeoJSON LineString from GPX track for intersection tests
    if (data && data.tracks.length > 0) {
      const coords = data.tracks[0].points.map(p => [p.lon, p.lat]); // GeoJSON is [lon, lat]
      if (coords.length >= 2) {
        // Create the feature, then extract the geometry for the state
        const lineFeature = lineString(coords);
        setGpxCourseLine(lineFeature.geometry);
      } else {
        setGpxCourseLine(null);
      }
    } else {
      setGpxCourseLine(null);
    }
  }, []);

  // Callback for pace changes from sidebar
  const handlePaceChange = useCallback((pace: string) => {
    // Add validation/parsing logic for pace format later
    setRunnerPace(pace);
    console.log("Runner pace updated:", pace);
  }, []);

  // Callback to toggle a spot selection
  const handleSpotToggle = useCallback((distance: number) => {
    setSelectedSpots(prevSpots => {
      const newSpots = new Set(prevSpots);
      if (newSpots.has(distance)) {
        newSpots.delete(distance);
      } else {
        newSpots.add(distance);
      }
      console.log("Selected spots updated:", newSpots);
      return newSpots;
    });
  }, []);

  // Callback for MapComponent to report calculated marker positions
  const handleMarkerPositionsCalculated = useCallback((positions: Map<number, L.LatLng>) => {
    console.log("Marker positions calculated:", positions);
    setMarkerPositions(positions);
  }, []);

  // Callback for MapComponent to report calculated segment travel times
  const handleSegmentTimesCalculated = useCallback((segmentTimes: number[] | null) => {
    console.log("Segment times calculated:", segmentTimes);
    setSegmentTravelTimes(segmentTimes);
  }, []);

  // Callback for travel profile changes from sidebar
  const handleTravelProfileChange = useCallback((profile: Utils.TravelProfile) => {
    console.log("Travel profile changed:", profile);
    setTravelProfile(profile);
    // Segment times will automatically recalculate because MapComponent depends on travelProfile via waypoints effect trigger
    // (Actually, need to add travelProfile as dependency in MapComponent routing effect)
  }, []);

  // Callback for race start time changes from sidebar
  const handleRaceStartTimeChange = useCallback((time: string) => setRaceStartTime(time), []);

  // Callback for numSpotsToSuggest changes from sidebar
  const handleNumSpotsChange = useCallback((num: number) => setNumSpotsToSuggest(num), []);

  // Callback for suggestionStrategy changes from sidebar
  const handleSuggestionStrategyChange = useCallback((strategy: Utils.SuggestionStrategy) => setSuggestionStrategy(strategy), []);

  // Callback for skipFirstKm changes from sidebar
  const handleSkipFirstKmChange = useCallback((km: number) => setSkipFirstKm(km), []);

  // Calculate waypoints for routing based on selected spots and their positions
  const waypoints = useMemo(() => {
    const sortedSpots = Array.from(selectedSpots).sort((a, b) => a - b);
    return sortedSpots
      .map(distance => markerPositions.get(distance)) // Get LatLng for each selected distance
      .filter((latLng): latLng is L.LatLng => latLng !== undefined); // Filter out undefined (shouldn't happen if logic is correct)
  }, [selectedSpots, markerPositions]);

  console.log("Calculated waypoints for routing:", waypoints);

  // --- Suggestion Logic ---
  const handleSuggestSpots = useCallback(() => {
    console.log(`[Suggest Spots] Requesting: ${numSpotsToSuggest} spots. Strategy: ${suggestionStrategy}. Skipping first: ${skipFirstKm}km`);

    // --- Filter Markers FIRST ---
    const skipDistance = skipFirstKm * 1000;
    // Get all potential markers from state
    const allMarkerEntries = Array.from(markerPositions.entries());
    // Filter out early markers
    const potentiallyAvailableMarkers = allMarkerEntries
      .filter(([distance, _]) => distance >= skipDistance)
      .sort((a, b) => a[0] - b[0]);

    console.log(`[Suggest Spots] Markers after skipping ${skipFirstKm}km: ${potentiallyAvailableMarkers.length}`);

    if (potentiallyAvailableMarkers.length === 0 || numSpotsToSuggest <= 0 || !gpxCourseLine) {
      setSelectedSpots(new Set());
      console.log("[Suggest Spots] No available markers after filtering/skipping.");
      return;
    }
    // --- End Filter ---

    // Use the filtered list from now on
    const availableMarkerEntries = potentiallyAvailableMarkers;
    const numToSelect = Math.min(numSpotsToSuggest, availableMarkerEntries.length);
    console.log(`[Suggest Spots] Available markers: ${availableMarkerEntries.length}. Will select: ${numToSelect}`);

    let suggestedDistances: number[] = [];

    if (suggestionStrategy === 'maxSpread') {
      if (numToSelect === 1 && availableMarkerEntries.length > 0) {
        suggestedDistances = [availableMarkerEntries[availableMarkerEntries.length - 1][0]];
      } else if (numToSelect > 1 && availableMarkerEntries.length > 1) {
        const step = (availableMarkerEntries.length - 1) / (numToSelect - 1);
        for (let i = 0; i < numToSelect; i++) {
          const index = Math.round(i * step);
          const safeIndex = Math.max(0, Math.min(index, availableMarkerEntries.length - 1));
          suggestedDistances.push(availableMarkerEntries[safeIndex][0]);
        }
      }
    } else { // minTravel - Operates on filtered list
      const runnerSecondsPerMeter = Utils.parsePaceToSecondsPerMeter(runnerPace);
      if (runnerSecondsPerMeter === null) {
        alert("Please enter a valid runner pace...");
        return;
      }

      if (availableMarkerEntries.length === 0) return; // Should be caught earlier, but safe check

      const firstMarkerEntry = availableMarkerEntries[0];
      suggestedDistances = [firstMarkerEntry[0]];
      let lastSpotDistance = firstMarkerEntry[0];
      let lastSpotLatLng = firstMarkerEntry[1];
      const usedIndices = new Set<number>([0]);

      while (suggestedDistances.length < numToSelect) {
        let bestNextSpotIndex = -1;
        let minFeasibleStraightLineDist = Infinity;

        for (let i = 0; i < availableMarkerEntries.length; i++) {
          if (usedIndices.has(i)) continue;
          const [potentialNextDistance, potentialNextLatLng] = availableMarkerEntries[i];
          // No need to check <= lastSpotDistance because we start from index 0 and use usedIndices

          const straightLineDist = lastSpotLatLng.distanceTo(potentialNextLatLng);
          const courseDistanceBetweenSpots = potentialNextDistance - lastSpotDistance;
          const runnerTimeSeconds = courseDistanceBetweenSpots * runnerSecondsPerMeter;

          let spectatorTimeSeconds = Infinity;
          if (travelProfile === 'walking' || travelProfile === 'cycling') {
            const speedMps = travelProfile === 'walking' ? AVG_WALKING_SPEED_MPS : AVG_CYCLING_SPEED_MPS;
            spectatorTimeSeconds = straightLineDist / speedMps;
          } else {
            spectatorTimeSeconds = Infinity;
          }

          let crossingPenalty = 0;
          const spectatorPathLine = lineString([
            [lastSpotLatLng.lng, lastSpotLatLng.lat],
            [potentialNextLatLng.lng, potentialNextLatLng.lat]
          ]);
          const intersections = lineIntersect(gpxCourseLine, spectatorPathLine);
          if (intersections.features.length > 0) {
            const startPt = point([lastSpotLatLng.lng, lastSpotLatLng.lat]);
            const endPt = point([potentialNextLatLng.lng, potentialNextLatLng.lat]);
            let trueIntersection = false;
            for (const feature of intersections.features) {
              const intersectPt = feature.geometry.coordinates;
              const distToStart = distance(startPt, intersectPt, {units: 'meters'});
              const distToEnd = distance(endPt, intersectPt, {units: 'meters'});
              if (distToStart > 10 && distToEnd > 10) {
                trueIntersection = true;
                break;
              }
            }
            if (trueIntersection) {
              console.log(`Course crossing detected between ${lastSpotDistance/1000}km and ${potentialNextDistance/1000}km`);
              crossingPenalty = COURSE_CROSSING_PENALTY_SECONDS;
            }
          }
          const isFeasible = runnerTimeSeconds > (spectatorTimeSeconds + crossingPenalty + SPECTATOR_BUFFER_SECONDS);
          if (isFeasible && straightLineDist < minFeasibleStraightLineDist) {
            minFeasibleStraightLineDist = straightLineDist;
            bestNextSpotIndex = i;
          }
        } // End loop through potential next spots

        if (bestNextSpotIndex !== -1) {
          const [nextDist, nextLatLng] = availableMarkerEntries[bestNextSpotIndex];
          suggestedDistances.push(nextDist);
          lastSpotDistance = nextDist;
          lastSpotLatLng = nextLatLng;
          usedIndices.add(bestNextSpotIndex);
        } else {
          console.warn(`[Suggest Spots] Could not find feasible spot ${suggestedDistances.length + 1} of ${numToSelect}. Stopping.`);
          break;
        }
      } // End while loop
    } // End minTravel logic

    console.log(`[Suggest Spots] Final suggested count: ${suggestedDistances.length}. Spots:`, suggestedDistances);
    setSelectedSpots(new Set(suggestedDistances));

  }, [markerPositions, numSpotsToSuggest, suggestionStrategy, runnerPace, travelProfile, gpxCourseLine, skipFirstKm]);
  // --- End Suggestion Logic ---

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  // Close sidebar if clicking outside it on mobile
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      // Check if sidebar is open and click is outside sidebar area
      // This requires the sidebar element to have a specific ID or ref
      const sidebar = document.getElementById('planner-sidebar');
      if (isSidebarOpen && sidebar && !sidebar.contains(event.target as Node)) {
        // Check if click was on the toggle button itself to prevent immediate close
        const toggleButton = document.getElementById('sidebar-toggle-button');
        if (!toggleButton || !toggleButton.contains(event.target as Node)) {
          setIsSidebarOpen(false);
        }
      }
    };

    if (isSidebarOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    } else {
      document.removeEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isSidebarOpen]);

  return (
    <div className="flex flex-col h-screen antialiased">
      {/* Header */}
      <header className="bg-card text-card-foreground border-b border-border p-3 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center space-x-4">
          {/* Mobile Toggle Button - shown only below md breakpoint */}
          <Button
            id="sidebar-toggle-button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={toggleSidebar}
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <h1 className="text-xl font-semibold">CheerChaser</h1>
        </div>
        {/* Conditional GPX Upload - Show only if no GPX data */}
        {!gpxData && (
          <GpxUpload onGpxParsed={handleGpxParsed} />
        )}
        {/* Add other header elements if needed */}
      </header>

      {/* Main Content Area */}
      <div className="flex grow overflow-hidden relative"> {/* Added relative for potential absolute sidebar */}
        {/* Sidebar - Conditionally positioned and styled */}
        <aside
          id="planner-sidebar" // Add ID for outside click detection
          className={`
            absolute top-0 left-0 h-full z-10 w-80 md:w-96 lg:w-[450px]  /* Mobile: Absolute, fixed width */
            transform transition-transform duration-300 ease-in-out         /* Smooth transition */
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}      /* Mobile: Slide in/out */
            md:static md:translate-x-0                                /* Desktop: Static position */
            bg-card border-r border-border 
            overflow-y-auto p-4 md:p-6 scrollbar-thin scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent
          `}
        >
          {/* Button to clear GPX data inside sidebar (shown when GPX is loaded) */}
          {gpxData && (
              <div className="mb-4">
                  <GpxUpload onGpxParsed={handleGpxParsed} showTextInsteadOfButton={true}/>
              </div>
          )}
          <PlannerSidebar
            gpxData={gpxData}
            runnerPace={runnerPace}
            onPaceChange={handlePaceChange}
            selectedSpots={selectedSpots}
            onSpotToggle={handleSpotToggle}
            markerPositions={markerPositions}
            segmentTravelTimes={segmentTravelTimes}
            travelProfile={travelProfile}
            onTravelProfileChange={handleTravelProfileChange}
            raceStartTime={raceStartTime}
            onRaceStartTimeChange={handleRaceStartTimeChange}
            numSpotsToSuggest={numSpotsToSuggest}
            onNumSpotsChange={handleNumSpotsChange}
            suggestionStrategy={suggestionStrategy}
            onSuggestionStrategyChange={handleSuggestionStrategyChange}
            onSuggestSpots={handleSuggestSpots}
            skipFirstKm={skipFirstKm}
            onSkipFirstKmChange={handleSkipFirstKmChange}
          />
        </aside>

        {/* Map takes remaining space - Ensure it's below the header/sidebar toggle */}
        <main className={`flex-grow h-full transition-all duration-300 ease-in-out relative z-0`}>
          {/* Map Content */}
          <MapComponent
            gpxData={gpxData}
            runnerPace={runnerPace}
            selectedSpots={selectedSpots}
            onSpotToggle={handleSpotToggle}
            onMarkerPositionsCalculated={handleMarkerPositionsCalculated}
            waypoints={waypoints}
            onSegmentTimesCalculated={handleSegmentTimesCalculated}
            travelProfile={travelProfile}
            raceStartTime={raceStartTime}
          />
        </main>
      </div>
      {/* Footer could be added here if needed */}
    </div>
  );
}

export default App;
