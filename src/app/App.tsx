import { useState } from 'react';
import { references } from '../data/references';
import { ReferenceLibrary } from '../library/ReferenceLibrary';
import type { ReferenceImage } from '../library/referenceTypes';
import { Workspace } from '../workspace/Workspace';
import { initialWorkspaceState, type WorkspaceState } from './appState';

export function App() {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);

  function selectImage(image: ReferenceImage) {
    setWorkspaceState((current) => ({
      ...current,
      image,
      viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    }));
  }

  return (
    <div className="app-shell">
      <ReferenceLibrary
        references={references}
        selectedImage={workspaceState.image}
        onSelectImage={selectImage}
        onUploadImage={selectImage}
      />
      <Workspace state={workspaceState} onChange={setWorkspaceState} />
    </div>
  );
}

