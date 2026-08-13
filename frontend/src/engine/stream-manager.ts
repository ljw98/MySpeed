/**
 * MySpeed — StreamManager.
 *
 * Manages the lifecycle of concurrent HTTP streams for download and upload
 * tests. Encapsulates XHR creation, progress tracking, and abort as a
 * standalone class shared by both tests.
 */

export interface StreamCallbacks {
  onProgress: (loaded: number) => void;
  onComplete: () => void;
  onError: (err: string) => void;
}

export class StreamManager {
  private streams = new Map<number, XMLHttpRequest>();
  private nextId = 1;

  /** Open a download stream. Returns a stream id (or 0 on failure). */
  createDownloadStream(url: string, callbacks: StreamCallbacks): number {
    const id = this.nextId++;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url + (url.includes('?') ? '&' : '?') + 'r=' + Math.random(), true);
    xhr.responseType = 'arraybuffer';

    xhr.onprogress = (e: ProgressEvent) => callbacks.onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        callbacks.onComplete();
      } else {
        callbacks.onError('HTTP ' + xhr.status);
      }
      this.streams.delete(id);
    };
    xhr.onerror = () => {
      callbacks.onError('network error');
      this.streams.delete(id);
    };
    xhr.ontimeout = () => {
      callbacks.onError('timeout');
      this.streams.delete(id);
    };

    this.streams.set(id, xhr);
    xhr.send();
    return id;
  }

  /** Open an upload stream. The blob is POSTed as the request body. */
  createUploadStream(url: string, blob: Blob, callbacks: StreamCallbacks): number {
    const id = this.nextId++;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url + (url.includes('?') ? '&' : '?') + 'r=' + Math.random(), true);

    // XHR upload progress events give us bytes sent.
    if (xhr.upload) {
      xhr.upload.onprogress = (e: ProgressEvent) => callbacks.onProgress(e.loaded);
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        callbacks.onComplete();
      } else {
        callbacks.onError('HTTP ' + xhr.status);
      }
      this.streams.delete(id);
    };
    xhr.onerror = () => {
      callbacks.onError('network error');
      this.streams.delete(id);
    };
    xhr.ontimeout = () => {
      callbacks.onError('timeout');
      this.streams.delete(id);
    };

    this.streams.set(id, xhr);
    xhr.send(blob);
    return id;
  }

  /** Abort a single stream by id. */
  abortStream(id: number): void {
    const xhr = this.streams.get(id);
    if (xhr) {
      xhr.abort();
      this.streams.delete(id);
    }
  }

  /** Abort every active stream. */
  abortAll(): void {
    for (const xhr of this.streams.values()) {
      xhr.abort();
    }
    this.streams.clear();
  }

  /** Number of currently active streams. */
  activeCount(): number {
    return this.streams.size;
  }
}
