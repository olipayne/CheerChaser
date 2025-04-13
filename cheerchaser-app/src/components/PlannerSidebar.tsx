import React from 'react';
import L from 'leaflet'; // Import L for LatLng type hint
import 'leaflet-routing-machine'; // Import for type hint
import GpxParser from 'gpxparser';
// Import Utils namespace for shared types and functions
import * as Utils from '@/utils';

// Import shadcn components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { AlertCircle, Trash2, Wand2 } from 'lucide-react'; // Import icons for warnings/buttons
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Import Select

// Use types via namespace
interface PlannerSidebarProps {
  gpxData: GpxParser | null;
  runnerPace: string;
  onPaceChange: (pace: string) => void;
  selectedSpots: Set<number>;
  onSpotToggle: (distance: number) => void;
  markerPositions: Map<number, L.LatLng>;
  segmentTravelTimes: number[] | null;
  travelProfile: Utils.TravelProfile;
  onTravelProfileChange: (profile: Utils.TravelProfile) => void;
  raceStartTime: string;
  onRaceStartTimeChange: (time: string) => void;
  numSpotsToSuggest: number;
  onNumSpotsChange: (num: number) => void;
  suggestionStrategy: Utils.SuggestionStrategy;
  onSuggestionStrategyChange: (strategy: Utils.SuggestionStrategy) => void;
  onSuggestSpots: () => void;
  skipFirstKm: number;
  onSkipFirstKmChange: (km: number) => void;
}

const PlannerSidebar: React.FC<PlannerSidebarProps> = ({
  gpxData,
  runnerPace,
  onPaceChange,
  selectedSpots,
  onSpotToggle,
  markerPositions,
  segmentTravelTimes,
  travelProfile,
  onTravelProfileChange,
  raceStartTime,
  onRaceStartTimeChange,
  numSpotsToSuggest,
  onNumSpotsChange,
  suggestionStrategy,
  onSuggestionStrategyChange,
  onSuggestSpots,
  skipFirstKm,
  onSkipFirstKmChange,
}) => {

  // Use Utils.parsePaceToSecondsPerMeter, etc.
  const secondsPerMeter = Utils.parsePaceToSecondsPerMeter(runnerPace);
  const sortedSpots = Array.from(selectedSpots).sort((a, b) => a - b);

  // Calculate runner ETAs for all selected spots
  const runnerETAs = new Map<number, number | null>();
  if (secondsPerMeter !== null) {
    sortedSpots.forEach(distance => {
      runnerETAs.set(distance, distance * secondsPerMeter);
    });
  }

  const travelOptions: { value: Utils.TravelProfile, label: string }[] = [
    { value: 'walking', label: 'Walking' },
    { value: 'cycling', label: 'Cycling' },
    { value: 'transit', label: 'Public Transport' },
  ];

  const suggestionStrategyOptions: { value: Utils.SuggestionStrategy, label: string }[] = [
    { value: 'maxSpread', label: 'Maximum Spread' },
    { value: 'minTravel', label: 'Minimum Travel (Naive)' },
  ];

  const isInputDisabled = !gpxData;
  const isTravelDisabled = !gpxData || sortedSpots.length < 2;
  const maxAvailableSpots = markerPositions.size; // Max spots user can ask for
  // const maxSkipKm = maxAvailableSpots > 0 ? Math.max(0, Math.floor(maxAvailableSpots - numSpotsToSuggest)) : 0; // Avoid skipping all possible spots - Remove unused variable

  const handleNumSpotsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let num = parseInt(e.target.value, 10);
    if (isNaN(num)) num = 1; // Default to 1 if input is invalid
    if (num < 1) num = 1;
    if (maxAvailableSpots > 0 && num > maxAvailableSpots) num = maxAvailableSpots;
    onNumSpotsChange(num);
  };

  const handleSkipKmInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let num = parseInt(e.target.value, 10);
    if (isNaN(num) || num < 0) num = 0;
    // Optional: Add validation against maxSkipKm if desired
    onSkipFirstKmChange(num);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Runner & Spectator Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Race Start Time Input */}
          <div className="grid gap-2">
            <Label htmlFor="race-start-time">Race Start Time (HH:MM)</Label>
            <Input 
              id="race-start-time" 
              type="time" 
              value={raceStartTime} 
              onChange={(e) => onRaceStartTimeChange(e.target.value)}
              disabled={isInputDisabled}
            />
          </div>
          {/* Runner Pace Input */}
          <div className="grid gap-2">
            <Label htmlFor="runner-pace">Runner's Pace (min/km)</Label>
            <Input
              id="runner-pace"
              type="text"
              value={runnerPace}
              onChange={(e) => onPaceChange(e.target.value)}
              placeholder="e.g., 5:30"
              disabled={isInputDisabled}
            />
            {!secondsPerMeter && runnerPace && (
              <p className="text-xs text-destructive">(Invalid format. Use MM:SS)</p>
            )}
          </div>

          {/* Spectator Travel Mode */}
          <div className="grid gap-2">
            <Label>Spectator Travel Mode</Label>
            <RadioGroup
              defaultValue={travelProfile}
              onValueChange={(value: string) => onTravelProfileChange(value as Utils.TravelProfile)}
              className="flex space-x-4 pt-1"
              disabled={isTravelDisabled}
            >
              {travelOptions.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.value} id={option.value} disabled={isTravelDisabled}/>
                  <Label htmlFor={option.value} className={`${
                    isTravelDisabled ? 'text-muted-foreground cursor-not-allowed' : ''
                  }`}>
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground pt-1">
              Note: Routing does not account for road closures or crossing delays. Public transport routing is currently unavailable.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Spot Suggestion Card */}
      <Card>
        <CardHeader>
          <CardTitle>Suggest Cheer Spots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="grid gap-2">
              <Label htmlFor="num-spots">Number of Spots</Label>
              <Input 
                id="num-spots" 
                type="number" 
                min={1} 
                max={maxAvailableSpots || 1} // Set max based on available markers
                value={numSpotsToSuggest} 
                onChange={handleNumSpotsInputChange} 
                disabled={isInputDisabled || maxAvailableSpots === 0}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="strategy">Strategy</Label>
              <Select 
                value={suggestionStrategy} 
                onValueChange={(value: string) => onSuggestionStrategyChange(value as Utils.SuggestionStrategy)}
                disabled={isInputDisabled || maxAvailableSpots === 0}
              >
                <SelectTrigger id="strategy">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  {suggestionStrategyOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="skip-km">Don't Suggest Spots Before (km)</Label>
            <Input 
              id="skip-km" 
              type="number" 
              min={0} 
              value={skipFirstKm}
              onChange={handleSkipKmInputChange} 
              placeholder="e.g., 10"
              disabled={isInputDisabled || maxAvailableSpots === 0}
            />
          </div>
          <Button 
            onClick={onSuggestSpots} 
            disabled={isInputDisabled || maxAvailableSpots === 0}
            className="w-full"
          >
            <Wand2 className="mr-2 h-4 w-4" /> Suggest Spots
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selected Cheer Spots</CardTitle>
        </CardHeader>
        <CardContent>
          {!gpxData && (
            <p className="text-sm text-muted-foreground">(Upload a GPX file to start planning)</p>
          )}
          {gpxData && sortedSpots.length === 0 && (
            <p className="text-sm text-muted-foreground">(Click markers on the map to add cheer spots)</p>
          )}

          {gpxData && sortedSpots.length > 0 && (
            <ul className="space-y-4">
              {sortedSpots.map((distance, index) => {
                const runnerETASeconds = runnerETAs.get(distance);
                
                // Create the formatted distance string
                const distanceString = Utils.formatDistanceString(distance);
                
                // --- Correct ETA String Calculation --- 
                let etaString = '';
                if (runnerETASeconds !== undefined && runnerETASeconds !== null) {
                  if (raceStartTime && /^\\d{2}:\\d{2}$/.test(raceStartTime)) {
                    etaString = `ETA: ${Utils.calculateRealTimeETA(raceStartTime, runnerETASeconds)}`;
                  } else {
                    etaString = `Duration: ${Utils.formatSecondsToHoursMinutes(runnerETASeconds)}`;
                  }
                } else {
                  etaString = "(Set pace for ETA)";
                }
                // --- End ETA Calculation --- 

                let feasibilityWarning: string | null = null;
                let segmentTimeString: string | null = null;
                // let isFeasible = true; // Remove unused variable

                // Feasibility Check
                if (index > 0 && segmentTravelTimes && segmentTravelTimes.length > index - 1 && runnerETAs.size > 0) {
                  const prevSpotDistance = sortedSpots[index - 1];
                  const prevRunnerETASeconds = runnerETAs.get(prevSpotDistance);
                  const currentRunnerETASeconds = runnerETAs.get(distance);
                  const spectatorTravelSeconds = segmentTravelTimes[index - 1];

                  if (prevRunnerETASeconds !== null && prevRunnerETASeconds !== undefined && 
                      currentRunnerETASeconds !== null && currentRunnerETASeconds !== undefined && 
                      spectatorTravelSeconds !== undefined) {
                   
                    const runnerTimeBetweenSpots = currentRunnerETASeconds - prevRunnerETASeconds;
                    const spectatorBufferSeconds = 60 * 5; // 5 minute buffer

                    segmentTimeString = Utils.formatSecondsToHMS(spectatorTravelSeconds);

                    if (spectatorTravelSeconds + spectatorBufferSeconds > runnerTimeBetweenSpots) {
                      feasibilityWarning = `Warning: Tight connection! Spectator travel (~${segmentTimeString}) + 5min buffer exceeds runner time (~${Utils.formatSecondsToHMS(runnerTimeBetweenSpots)}).`;
                    }
                  }
                }

                // --- Restore the return statement for the list item --- 
                return (
                  <li key={distance}>
                    <div className="flex justify-between items-start space-x-2">
                      <div className="flex-grow">
                        <p className="font-semibold">{distanceString}</p>
                        <p className="text-sm text-muted-foreground">{etaString}</p>
                        {segmentTimeString && (<p className="text-xs text-sky-600">(Spectator travel from previous: ~{segmentTimeString})</p>)}
                        {feasibilityWarning && (<div className="flex items-center text-xs text-amber-700 mt-1"><AlertCircle className="h-3 w-3 mr-1" /> {feasibilityWarning}</div>)}
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-red-100 h-7 w-7" onClick={() => onSpotToggle(distance)} title="Remove spot"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    {index < sortedSpots.length - 1 && <Separator className="my-3" />} 
                  </li>
                );
                // --- End restored return --- 

              })} 
            </ul>
          )} 
        </CardContent> 
      </Card> 
    </div> // Add closing div for the main component wrapper
  );
};

export default PlannerSidebar;