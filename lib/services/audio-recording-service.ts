export class AudioRecordingService {
  isBrowserSupported() {
    return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices;
  }
}
