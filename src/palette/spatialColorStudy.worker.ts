import { createSpatialColorStudy, type ShapeDetail } from './spatialColorStudy';

type StudyRequest = {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  details: ShapeDetail[];
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<StudyRequest>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  const { id, width, height, buffer, details } = event.data;
  const source = new ImageData(new Uint8ClampedArray(buffer), width, height);

  for (const detail of details) {
    const result = createSpatialColorStudy(source, detail);

    workerScope.postMessage({
      id,
      detail,
      width: result.mapped.width,
      height: result.mapped.height,
      buffer: result.mapped.data.buffer,
      swatches: result.swatches,
    }, [result.mapped.data.buffer]);
  }
};
