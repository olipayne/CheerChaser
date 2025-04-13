// Shared Types
export type TravelProfile = 'walking' | 'cycling' | 'transit';
export type SuggestionStrategy = 'maxSpread' | 'minTravel';

// --- Existing Utils ---
export const parsePaceToSecondsPerMeter = (pace: string): number | null => {
    const parts = pace.split(':');
    if (parts.length !== 2) return null;
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds)) return null;
    const totalSecondsPerKm = minutes * 60 + seconds;
    if (totalSecondsPerKm <= 0) return null; // Pace must be positive
    return totalSecondsPerKm / 1000; // seconds per meter
};

export const formatSecondsToHMS = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return "--:--:--";
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const paddedHours = String(hours).padStart(2, '0');
    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(seconds).padStart(2, '0');
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
};

export const calculateRealTimeETA = (startTimeString: string, secondsToAdd: number): string => {
    console.log("[calculateRealTimeETA] Inputs:", { startTimeString, secondsToAdd }); // Log inputs
    if (!startTimeString || !/^\d{2}:\d{2}$/.test(startTimeString) || isNaN(secondsToAdd) || secondsToAdd < 0) {
        console.log("[calculateRealTimeETA] Failing validation"); // Log validation fail
        return "--:--"; // Return placeholder if invalid input
    }

    try {
        const [startHours, startMinutes] = startTimeString.split(':').map(Number);
        console.log("[calculateRealTimeETA] Parsed Start Time:", { startHours, startMinutes }); // Log parsed time

        // Create a date object (date part is arbitrary, only time matters)
        const etaDate = new Date();
        console.log("[calculateRealTimeETA] Initial etaDate:", etaDate.toString()); // Log initial date
        etaDate.setHours(startHours, startMinutes, 0, 0); // Set initial time
        console.log("[calculateRealTimeETA] etaDate after setHours:", etaDate.toString()); // Log after setHours

        // Add the runner's duration in seconds
        etaDate.setSeconds(etaDate.getSeconds() + secondsToAdd);
        console.log("[calculateRealTimeETA] etaDate after setSeconds:", etaDate.toString()); // Log after setSeconds

        // Format the resulting time
        const etaHours = String(etaDate.getHours()).padStart(2, '0');
        const etaMinutes = String(etaDate.getMinutes()).padStart(2, '0');
        console.log("[calculateRealTimeETA] Formatted Output:", { etaHours, etaMinutes }); // Log formatted output

        return `${etaHours}:${etaMinutes}`; // Return HH:MM format

    } catch (error) {
        console.error("[calculateRealTimeETA] Error:", error); // Log any caught error
        return "--:--"; // Fallback on error
    }
};

export const formatSecondsToHoursMinutes = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return "-:--"; // Placeholder for invalid duration
    }
    if (totalSeconds === 0) {
        return "0m";
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    let result = "";
    if (hours > 0) {
        result += `${hours}h`;
        if (minutes > 0) {
            result += ` ${minutes}m`; // Add space only if both are present
        }
    } else if (minutes > 0) {
        result = `${minutes}m`;
    } else {
        // If less than a minute, show seconds? Or just "< 1m"? Let's show < 1m for simplicity.
        result = "< 1m";
    }
    return result;
};

// Can add more utility functions here later (e.g., distance formatting) 
export const formatDistanceString = (distanceInMeters: number): string => {
    if (isNaN(distanceInMeters) || distanceInMeters < 0) {
        return "Invalid distance";
    }
    
    if (distanceInMeters < 1000) {
        // If less than 1 km, show in meters
        return `${Math.round(distanceInMeters)}m`;
    } else {
        // Otherwise show in kilometers with 1 decimal place
        const km = distanceInMeters / 1000;
        return `${km.toFixed(1)}km`;
    }
}; 