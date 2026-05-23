import { useState } from 'react';
import { references } from '../data/references';
import { ReferenceLibrary } from '../library/ReferenceLibrary';
import type { ReferenceImage } from '../library/referenceTypes';
import { Workspace } from '../workspace/Workspace';
import { AboutPage } from './AboutPage';
import { initialWorkspaceState, type WorkspaceState } from './appState';

type AppView = 'gallery' | 'edit';

export function App() {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);
  const [view, setView] = useState<AppView>('gallery');
  const [isAboutOpen, setIsAboutOpen] = useState(false);

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
    setView('edit');
  }

  return (
    <div className="app-shell" data-view={view}>
      {view === 'gallery' ? (
        <ReferenceLibrary
          references={references}
          selectedImage={workspaceState.image}
          onSelectImage={selectImage}
          onUploadImage={selectImage}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      ) : (
        <Workspace
          state={workspaceState}
          onBack={() => setView('gallery')}
          onChange={setWorkspaceState}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      )}
      {isAboutOpen ? <AboutPage onClose={() => setIsAboutOpen(false)} /> : null}
    </div>
  );
}
