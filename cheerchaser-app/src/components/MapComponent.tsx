import React, { useEffect, useRef, useCallback } from 'react';
import L, { LatLng } from 'leaflet';
import 'leaflet-routing-machine'; // Import routing machine
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'; // Import routing machine CSS
import 'leaflet/dist/leaflet.css';
import GpxParser from 'gpxparser';
import * as Utils from '@/utils'; // Import as namespace

// --- Explicitly Set Default Icon Path (BEFORE component) ---
// This relies on images being copied to public/images/
L.Icon.Default.prototype.options.imagePath = '/images/';

// Define custom icons
// const selectedIcon = new Icon({
//     iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzODQgNTEyIj48IS0tISBGb250IEF3ZXNvbWUgUHJvIDYuMi4wIGJ5IEBmb250YXdlc29tZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tIExpY2Vuc2UgLSBodHRwczovL2ZvbnRhd2Vzb21lLmNvbS9saWNlbnNlIChDb21tZXJjaWFsIExpY2Vuc2UpIENvcHlyaWdodCAyMDIyIEZvbnRpY29ucywgSW5jLiAtLT48cGF0aCBmaWxsPSIjMzE4MmNlIiBkPSJNMTcxLjEgNDQ0LjRsLTk2Ljk2LTk2Ljk2Yy0yNC4zOC0yNC4zOC0yNC4zOC02My44NyAwLTg4LjI1bDIyLjYyLTIyLjYyYzI0LjM4LTI0LjM4IDYzLjg3LTI0LjM4IDg4LjI1IDBMMTkyIDMwOC44bDIyLjYzLTIyLjYzYzI0LjM4LTI0LjM4IDYzLjg3LTI0LjM4IDg4LjI1IDBsMjIuNjIgMjIuNjJjMjQuMzggMjQuMzggMjQuMzggNjMuODcgMCA4OC4yNWwtOTYuOTYgOTYuOTZDNjkuMDQgNDY4LjggMTQuOTYgNDY4LjggLTEuMTIgNDQ0LjRDNi4zMyAyMDYuODQgMTQ1LjggMCAxOTIgMFMxNzcuNyAyMDYuODQgMTcxLjEgNDQ0LjR6Ii8+PC9zdmc+',
//     iconSize: [25, 41],
//     iconAnchor: [12, 41],
//     popupAnchor: [1, -34],
//     tooltipAnchor: [16, -28],
//     // Explicitly set shadowUrl to avoid potential default issues
//     shadowUrl: '/images/marker-shadow.png',
//     shadowSize: [41, 41]
// });

// Define the interval for *potential* spots (not necessarily displayed)
const POTENTIAL_SPOT_INTERVAL = 50; // meters

// Define props interface
interface MapComponentProps {
  gpxData: GpxParser | null;
  runnerPace: string;
  selectedSpots: Set<number>;
  onSpotToggle: (distance: number) => void;
  onMarkerPositionsCalculated: (positions: Map<number, LatLng>) => void;
  waypoints: LatLng[]; // Add waypoints prop for routing
  onSegmentTimesCalculated: (segmentTimes: number[] | null) => void; // New prop name and type (array of seconds)
  travelProfile: Utils.TravelProfile; // Use namespaced type
  raceStartTime: string; // Add race start time prop
}

const MapComponent: React.FC<MapComponentProps> = ({ gpxData, runnerPace, selectedSpots, onSpotToggle, onMarkerPositionsCalculated, waypoints, onSegmentTimesCalculated, travelProfile, raceStartTime }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const trackLayerRef = useRef<L.Polyline | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const routingControlRef = useRef<L.Routing.Control | null>(null); // Ref for routing control
  const calculatedMarkerPositionsRef = useRef<Map<number, LatLng>>(new Map());
  const trailTooltipRef = useRef<L.Tooltip | null>(null);
  const trailPointsRef = useRef<LatLng[]>([]);
  const trailCumulativeDistancesRef = useRef<number[]>([]);
  const trailHoverMarkerRef = useRef<L.CircleMarker | null>(null); // Ref for hover marker

  // Helper function to display tooltip and marker for a given LatLng
  const showTrailInfo = useCallback((latlng: L.LatLng, map: L.Map | null, points: LatLng[], cumulativeDistances: number[]) => {
    if (!map) return;

    const { distance, point, segmentIndex, ratio } = findNearestPointOnTrail(latlng, points);
    // console.log("Nearest Point Data:", { distance, point: `(${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`, segmentIndex, ratio: ratio.toFixed(3) });

    // Only show tooltip and marker if reasonably close to the trail (40 meters)
    if (distance > 40) { // Increased threshold for stickiness
      // Hide if currently shown (e.g., from mousemove)
      if (trailTooltipRef.current) {
        map.closeTooltip(trailTooltipRef.current);
        trailTooltipRef.current = null;
      }
      if (trailHoverMarkerRef.current) {
        map.removeLayer(trailHoverMarkerRef.current);
        trailHoverMarkerRef.current = null;
      }
      return;
    }

    // Find distance along the trail using the precise segment and ratio
    const trailDistance = calculateDistanceAlongTrail(segmentIndex, ratio, points, cumulativeDistances);
    // console.log("Calculated Trail Distance:", trailDistance.toFixed(1));

    // Format distance
    const distanceString = Utils.formatDistanceString(trailDistance);

    // Calculate time based on runner pace
    const secondsPerMeter = Utils.parsePaceToSecondsPerMeter(runnerPace);
    let timeString = "";

    if (secondsPerMeter !== null) {
      const totalSeconds = trailDistance * secondsPerMeter;

      if (raceStartTime && /^\d{2}:\d{2}$/.test(raceStartTime)) {
        timeString = Utils.calculateRealTimeETA(raceStartTime, totalSeconds);
      } else {
        timeString = Utils.formatSecondsToHoursMinutes(totalSeconds);
      }
    } else {
      timeString = "(Set pace for time)";
    }

    // Create or update tooltip
    const tooltipContent = `<div><strong>${distanceString}</strong><br/>ETA: ${timeString}</div>`;

    if (trailTooltipRef.current) {
      trailTooltipRef.current.setLatLng(point);
      trailTooltipRef.current.setContent(tooltipContent);
    } else {
      trailTooltipRef.current = L.tooltip({
        offset: [0, -5],
        className: 'trail-tooltip',
        opacity: 0.9,
        sticky: true, // Keep tooltip open on mobile after tap
      })
      .setLatLng(point)
      .setContent(tooltipContent)
      .openOn(map);
    }

    // Create or update hover marker
    if (trailHoverMarkerRef.current) {
      trailHoverMarkerRef.current.setLatLng(point);
    } else {
      trailHoverMarkerRef.current = L.circleMarker(point, {
        radius: 5,
        fillColor: "#3182ce", // Match tooltip border color
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
        interactive: false, // Marker shouldn't capture events
      }).addTo(map);
    }
  }, [runnerPace, raceStartTime]); // Dependencies for the callback

  // Function to hide the trail info tooltip and marker
  const hideTrailInfo = useCallback((map: L.Map | null) => {
    if (!map) return;
    if (trailTooltipRef.current) {
      map.closeTooltip(trailTooltipRef.current);
      trailTooltipRef.current = null;
    }
    if (trailHoverMarkerRef.current) {
      map.removeLayer(trailHoverMarkerRef.current);
      trailHoverMarkerRef.current = null;
    }
  }, []);

  // Effect for initializing the map
  useEffect(() => {
    let map: L.Map | null = null;
    if (mapContainerRef.current && !mapInstanceRef.current) {
      map = L.map(mapContainerRef.current).setView([51.505, -0.09], 13);
      mapInstanceRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);

      // Remove map click handler - dismissal handled by polyline click toggle
      // map.on('click', () => {
      //   hideTrailInfo(map);
      // });
    }
    return () => {
      // Cleanup map instance and handlers
      if (map) {
        // map.off('click'); // No longer need to remove map click listener
        map.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this runs only once

  // Effect for calculating potential spots and drawing selected ones
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();
    calculatedMarkerPositionsRef.current.clear();
    const newMarkerPositions = new Map<number, LatLng>();
    const fiveKmMarkerPositions = new Map<number, LatLng>(); // Store 5km markers separately

    // Remove existing track and tooltip
    if (trackLayerRef.current) {
      map.removeLayer(trackLayerRef.current);
      trackLayerRef.current = null;
    }
    
    // Track Drawing Logic
    if (gpxData && gpxData.tracks.length > 0) {
      const points: LatLng[] = gpxData.tracks[0].points.map(p => new LatLng(p.lat, p.lon));
      trailPointsRef.current = points;
      
      if (points.length > 1) {
        // Calculate cumulative distances for each point along the trail
        const cumulativeDistances: number[] = [0];
        let totalDist = 0;
        
        for (let i = 1; i < points.length; i++) {
          totalDist += points[i-1].distanceTo(points[i]);
          cumulativeDistances.push(totalDist);
        }
        
        trailCumulativeDistancesRef.current = cumulativeDistances;
        
        // Create polyline with hover interaction
        const polyline = L.polyline(points, { 
          color: 'red',
          weight: 6, // Make line slightly thicker for easier hovering
          interactive: true // Make sure it's interactive
        });
        
        // Add mouse event handlers
        polyline.on('mouseover', () => {
          map.getContainer().style.cursor = 'pointer';
        });
        
        polyline.on('mouseout', () => { // Keep mouseout for desktop hover
          map.getContainer().style.cursor = '';
          if (trailTooltipRef.current) {
            map.closeTooltip(trailTooltipRef.current);
            trailTooltipRef.current = null;
          }
          // Remove hover marker on mouseout
          if (trailHoverMarkerRef.current) {
            map.removeLayer(trailHoverMarkerRef.current);
            trailHoverMarkerRef.current = null;
          }
        });
        
        polyline.on('mousemove', (e) => { // Handles desktop hover
          showTrailInfo(e.latlng, map, points, cumulativeDistances);
        });

        // Add click handler for mobile tap interaction - TOGGLE behaviour
        polyline.on('click', (e) => {
          L.DomEvent.stopPropagation(e); // Prevent map click handler (if any existed) from firing
          
          // Check if info is already shown, if so, hide it (toggle off)
          if (trailTooltipRef.current || trailHoverMarkerRef.current) {
             hideTrailInfo(map); // Use helper to hide
          } else {
            // Otherwise, show it (toggle on)
            showTrailInfo(e.latlng, map, points, cumulativeDistances);
          }
        });
        
        polyline.addTo(map);
        trackLayerRef.current = polyline;
        map.fitBounds(polyline.getBounds());
      }
    }

    const secondsPerMeter = Utils.parsePaceToSecondsPerMeter(runnerPace);
    console.log("[MapComponent] Pace Input:", runnerPace, "Parsed s/m:", secondsPerMeter);
    console.log("[MapComponent] Race Start Time Input:", raceStartTime);

    let totalTrackDistance = 0;
    let finishLatLng: LatLng | null = null;

    if (gpxData && gpxData.tracks.length > 0) {
      const points: LatLng[] = gpxData.tracks[0].points.map(p => new LatLng(p.lat, p.lon));
      
      if (points.length > 1) {
        finishLatLng = points[points.length - 1];

        // --- Calculate ALL Potential Spot Positions & 5KM Markers ---
        let totalDistance = 0;
        let nextPotentialSpotDist = POTENTIAL_SPOT_INTERVAL;
        let nextFiveKmMark = 5000; // Start checking for 5km mark

        for (let i = 1; i < points.length; i++) {
          const prevPoint = points[i - 1];
          const currentPoint = points[i];
          const segmentDistance = prevPoint.distanceTo(currentPoint);

          while (totalDistance + segmentDistance >= nextPotentialSpotDist) {
            const distanceToSpot = nextPotentialSpotDist - totalDistance;
            const ratio = distanceToSpot / segmentDistance;
            const spotLat = prevPoint.lat + (currentPoint.lat - prevPoint.lat) * ratio;
            const spotLng = prevPoint.lng + (currentPoint.lng - prevPoint.lng) * ratio;
            const spotPosition = new LatLng(spotLat, spotLng);
            const currentPotentialDistance = nextPotentialSpotDist;
            newMarkerPositions.set(currentPotentialDistance, spotPosition);
            nextPotentialSpotDist += POTENTIAL_SPOT_INTERVAL;
          }

          // Check for 5km markers within this segment
          while (totalDistance + segmentDistance >= nextFiveKmMark) {
            const distanceTo5kMark = nextFiveKmMark - totalDistance;
            const ratio5k = distanceTo5kMark / segmentDistance;
            const spotLat5k = prevPoint.lat + (currentPoint.lat - prevPoint.lat) * ratio5k;
            const spotLng5k = prevPoint.lng + (currentPoint.lng - prevPoint.lng) * ratio5k;
            const spotPosition5k = new LatLng(spotLat5k, spotLng5k);
            fiveKmMarkerPositions.set(nextFiveKmMark, spotPosition5k);
            console.log(`[MapComponent] Calculated 5km marker at ${nextFiveKmMark}m`);
            nextFiveKmMark += 5000; // Check for the next 5km mark
          }

          totalDistance += segmentDistance;
        }
        totalTrackDistance = totalDistance;

        if (finishLatLng) {
          newMarkerPositions.set(totalTrackDistance, finishLatLng);
        }
        // --- End Calculating Potential Spots ---

        calculatedMarkerPositionsRef.current = newMarkerPositions;
        onMarkerPositionsCalculated(newMarkerPositions);

        // --- Render 5KM Markers --- 
        fiveKmMarkerPositions.forEach((markerPosition, distance) => {
          const km = distance / 1000;
          const kmLabel = `${km}k`;

          const iconHtml = `
            <div class="km-marker">
              ${kmLabel}
            </div>
          `;
          const markerIcon = L.divIcon({
            html: iconHtml,
            className: 'km-marker-container', // Use a container class for potential base styling
            iconSize: [30, 20], // Adjust size as needed
            iconAnchor: [15, 10] // Center the anchor
          });

          let etaString = '';
          if (secondsPerMeter !== null) {
            const timeInSeconds = distance * secondsPerMeter;
            if (raceStartTime && /^\d{2}:\d{2}$/.test(raceStartTime)) {
              etaString = `ETA: ${Utils.calculateRealTimeETA(raceStartTime, timeInSeconds)}`;
            } else {
              etaString = `Duration: ${Utils.formatSecondsToHoursMinutes(timeInSeconds)}`;
            }
          } else {
            etaString = '(Set pace)';
          }

          const marker = L.marker(markerPosition, { 
            icon: markerIcon, 
            zIndexOffset: 50, // Ensure they are below selected markers potentially
            interactive: false // Make them non-clickable for selection
          });
          
          // Alternate tooltip direction to reduce overlap
          const isOddMultiple = (km / 5) % 2 !== 0;
          const tooltipDirection = isOddMultiple ? 'top' : 'bottom';
          const tooltipOffset = isOddMultiple ? L.point(0, -10) : L.point(0, 10); // Adjust offset based on direction
          
          const tooltipContent = `<strong>${kmLabel}</strong><br>${etaString}`;
          marker.bindTooltip(tooltipContent, { 
            permanent: true, 
            direction: tooltipDirection, 
            offset: tooltipOffset, // Position above/below marker
            className: 'km-marker-tooltip' // Optional custom class
          });
          markerLayer.addLayer(marker);
        });
        // --- End Render 5KM Markers ---

        // --- Render Markers ONLY for SELECTED Spots ---
        const sortedSelectedSpots = Array.from(selectedSpots).sort((a, b) => a - b);
        const firstKmKey = Array.from(newMarkerPositions.keys())
                              .reduce((prev, curr) => Math.abs(curr - 1000) < Math.abs(prev - 1000) ? curr : prev, Infinity);

        sortedSelectedSpots.forEach(selectedDistance => {
          const markerPosition = newMarkerPositions.get(selectedDistance);
          if (!markerPosition) return;

          const isSelected = true;
          const km = selectedDistance / 1000;
          let extraClasses = '';
          if (selectedDistance === firstKmKey) {
              extraClasses += ' start-marker';
          }

          // Don't render KM marker if it's the exact finish line position
          // (the dedicated finish marker handles this if selected)
          if (finishLatLng && markerPosition.equals(finishLatLng) && selectedDistance === totalTrackDistance) {
              return;
          }

          const iconHtml = `
            <div class="cheer-marker ${isSelected ? 'selected' : ''}${extraClasses}">
              ${Number.isInteger(km) ? km : km.toFixed(1)}
            </div>
          `;
          const isStart = extraClasses.includes('start-marker');
          const markerIcon = L.divIcon({
            html: iconHtml,
            className: '',
            iconSize: isStart ? [32, 32] : [28, 28],
            iconAnchor: isStart ? [16, 16] : [14, 14]
          });

          let etaString = '';
          if (secondsPerMeter !== null) {
            const timeInSeconds = selectedDistance * secondsPerMeter;
            if (raceStartTime && /^\d{2}:\d{2}$/.test(raceStartTime)) {
              etaString = `ETA: ${Utils.calculateRealTimeETA(raceStartTime, timeInSeconds)}`;
            } else {
              etaString = `Duration: ${Utils.formatSecondsToHoursMinutes(timeInSeconds)}`;
            }
          } else {
            etaString = '(Set pace)';
          }

          const marker = L.marker(markerPosition, { icon: markerIcon });
          const tooltipContent = etaString;
          marker.bindTooltip(tooltipContent, { permanent: true, direction: 'top', offset: L.point(0, -14) });
          marker.on('click', () => { onSpotToggle(selectedDistance); });
          markerLayer.addLayer(marker);
        });
        // --- End Rendering Selected Markers ---

        // --- Add Specific Finish Line Marker (if finish exists and is selected) ---
        if (finishLatLng && totalTrackDistance > 0 && selectedSpots.has(totalTrackDistance)) {
          const isFinishSelected = true; // Already checked selectedSpots.has
          let finishEtaString = '(Set pace)';
          if (secondsPerMeter !== null) {
            const finishTimeInSeconds = totalTrackDistance * secondsPerMeter;
            if (raceStartTime && /^\d{2}:\d{2}$/.test(raceStartTime)) {
              finishEtaString = `ETA: ${Utils.calculateRealTimeETA(raceStartTime, finishTimeInSeconds)}`;
            } else {
              finishEtaString = `Duration: ${Utils.formatSecondsToHoursMinutes(finishTimeInSeconds)}`;
            }
          }

          const finishIconHtml = `
            <div class="finish-line-marker ${isFinishSelected ? 'selected' : ''}">
              🏁
            </div>
          `;
          const finishMarkerIcon = L.divIcon({
            html: finishIconHtml,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
          const finishMarker = L.marker(finishLatLng, { icon: finishMarkerIcon, zIndexOffset: 100 });
          const finishTooltipContent = `Finish (${(totalTrackDistance / 1000).toFixed(2)} km)<br>${finishEtaString}`;
          finishMarker.bindTooltip(finishTooltipContent, { permanent: true, direction: 'top', offset: L.point(0, -16) });
          finishMarker.on('click', () => { onSpotToggle(totalTrackDistance); });
          markerLayer.addLayer(finishMarker);
        }
        // --- End Finish Line Marker ---
      }
    } else {
      onMarkerPositionsCalculated(new Map());
    }
  }, [gpxData, runnerPace, selectedSpots, onSpotToggle, onMarkerPositionsCalculated, raceStartTime, showTrailInfo, hideTrailInfo]); // Add showTrailInfo & hideTrailInfo to dependencies

  // Effect for handling routing based on waypoints and travel profile
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    let currentRoutingControl: L.Routing.Control | null = null;

    const removeRoutingControl = () => {
      if (currentRoutingControl) {
        map.removeControl(currentRoutingControl);
      }
      if (routingControlRef.current === currentRoutingControl) {
        routingControlRef.current = null;
      }
      onSegmentTimesCalculated(null); // Notify parent
    };

    // Clear previous route immediately
    if (routingControlRef.current) {
      map.removeControl(routingControlRef.current);
      routingControlRef.current = null;
    }
    onSegmentTimesCalculated(null); // Ensure state is cleared

    if (waypoints.length >= 2 && travelProfile !== 'transit') {
      try {
        // Define the OSRM router with the selected profile
        const router = L.Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1', // Default OSRM demo server
          profile: `/${travelProfile}/`, // Specify the profile in the URL path
          // Note: Check OSRM documentation for exact profile path format if needed
        });

        const routingControl = L.Routing.control({
          waypoints: waypoints,
          router: router, // Use the configured router
          routeWhileDragging: false,
          show: false,
          addWaypoints: false,
          lineOptions: { styles: [{ color: 'blue', opacity: 0.6, weight: 4 }] } as any,
          // Explicitly use default icon for waypoints if needed (usually handles itself)
          // createMarker: function(i, waypoint, n) { return L.marker(waypoint.latLng); }
        }).addTo(map);

        currentRoutingControl = routingControl;
        routingControlRef.current = routingControl;

        routingControl.on('routesfound', function(e: L.Routing.RoutingResultEvent) {
          const routes = e.routes;
          if (routes && routes.length > 0) {
            // Access legs/summary using type assertion
            const routeData = routes[0] as any; 
            if (routeData.legs && routeData.legs.length > 0) {
              const segmentTimes = routeData.legs.map((leg: any) => leg.summary.totalTime);
              console.log("[MapComponent] Segment Travel Times (seconds) from Legs:", segmentTimes);
              onSegmentTimesCalculated(segmentTimes);
            } else {
              console.warn("[MapComponent] Route found, but legs data is missing.");
              onSegmentTimesCalculated(null);
            }
          } else {
            onSegmentTimesCalculated(null);
          }
        });

        routingControl.on('routingerror', function(e: L.Routing.RoutingErrorEvent) {
          console.error("Routing Error:", e.error);
          onSegmentTimesCalculated(null);
        });

      } catch (error) {
        console.error("Error creating routing control:", error);
        onSegmentTimesCalculated(null);
      }
    } else if (travelProfile === 'transit') {
      console.warn("Transit routing not available, no route line will be shown.");
    }

    return removeRoutingControl;
  }, [waypoints, travelProfile, onSegmentTimesCalculated]);

  // Helper function to find the nearest point on the trail to a given latlng
  // Returns distance, closest point, index of the starting point of the segment, and ratio along segment
  const findNearestPointOnTrail = (latlng: L.LatLng, trailPoints: L.LatLng[]): { distance: number, point: L.LatLng, segmentIndex: number, ratio: number } => {
    let minDistance = Infinity;
    let closestPoint = trailPoints[0];
    let closestSegmentIndex = 0;
    let closestRatio = 0;
    
    // Find the closest trail segment
    for (let i = 0; i < trailPoints.length - 1; i++) {
      const p1 = trailPoints[i];
      const p2 = trailPoints[i + 1];
      
      // Find the projection of latlng onto the segment p1-p2
      const segmentLength = p1.distanceTo(p2);
      if (segmentLength === 0) continue;
      
      // Vector p1 -> p2 (in degrees/coordinate space)
      const vx = p2.lng - p1.lng;
      const vy = p2.lat - p1.lat;
      
      // Vector p1 -> latlng (mouse position)
      const wx = latlng.lng - p1.lng;
      const wy = latlng.lat - p1.lat;
      
      // Calculate the projection ratio 't' using dot products
      // t = dot(w, v) / dot(v, v)
      const dot_wv = wx * vx + wy * vy;
      const dot_vv = vx * vx + vy * vy;
      
      // Avoid division by zero if segment has zero length in coordinate space
      const t = (dot_vv < 1e-12) ? 0 : dot_wv / dot_vv;
      
      // Clamp the ratio 't' to be between 0 and 1 to stay on the segment
      const ratio = Math.max(0, Math.min(1, t));
      
      // Calculate the actual closest point coordinates on the segment
      const pointOnSegment = new L.LatLng(
        p1.lat + ratio * vy, // Use ratio * vy (delta lat)
        p1.lng + ratio * vx  // Use ratio * vx (delta lng)
      );
      
      const distance = latlng.distanceTo(pointOnSegment); // Real distance in meters
      
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = pointOnSegment;
        closestSegmentIndex = i; // Store index of segment start point
        closestRatio = ratio; // Store ratio along the segment
      }
    }
    
    return { distance: minDistance, point: closestPoint, segmentIndex: closestSegmentIndex, ratio: closestRatio };
  };
  
  // Helper function to calculate the distance along the trail using segment index and ratio
  const calculateDistanceAlongTrail = (segmentIndex: number, ratio: number, trailPoints: L.LatLng[], cumulativeDistances: number[]): number => {
    // Get distance to start of the identified segment
    const baseDistance = cumulativeDistances[segmentIndex];
    
    // Get the full length of the identified segment
    const p1 = trailPoints[segmentIndex];
    const p2 = trailPoints[segmentIndex + 1];
    const segmentLength = p1.distanceTo(p2);
    
    // Calculate total distance by adding the proportional distance along the segment
    return baseDistance + (ratio * segmentLength);
  };

  // The actual component return
  return <div ref={mapContainerRef} className="grow h-full" />;
};

export default MapComponent; 