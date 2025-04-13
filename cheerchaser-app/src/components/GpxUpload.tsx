import React, { useState, useCallback } from 'react';
import GpxParser from 'gpxparser';

interface GpxUploadProps {
  onGpxParsed: (gpxData: GpxParser) => void;
  showTextInsteadOfButton?: boolean;
}

const GpxUpload: React.FC<GpxUploadProps> = ({ onGpxParsed, showTextInsteadOfButton = false }) => {
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setError('No file selected.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') {
        setError('Failed to read file content.');
        return;
      }
      try {
        const gpx = new GpxParser();
        gpx.parse(content);
        if (gpx.tracks.length === 0) {
          setError('No tracks found in the GPX file.');
        } else {
          setError(null); // Clear previous errors
          onGpxParsed(gpx);
        }
      } catch (err) {
        console.error("Error parsing GPX file:", err);
        setError(`Error parsing GPX file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    reader.onerror = () => {
      setError('Error reading file.');
    };
    reader.readAsText(file);

    // Reset file input value to allow uploading the same file again
    event.target.value = '';

  }, [onGpxParsed]);

  return (
    <div className="gpx-upload-container">
      {showTextInsteadOfButton ? (
        <label htmlFor="gpx-upload-sidebar" className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer underline">
          Upload new GPX...
          <input
            id="gpx-upload-sidebar"
            type="file"
            accept=".gpx"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      ) : (
        <label htmlFor="gpx-upload-header" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-xs text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer">
          Upload GPX
          <input
            id="gpx-upload-header"
            type="file"
            accept=".gpx"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default GpxUpload; 