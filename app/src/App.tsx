// App — Root component. Manages the open-projects list, active project, and top-level modal visibility.
"use client";

import { useState, useRef, useCallback } from "react";
import '@xyflow/react/dist/style.css';
import '@/styles/SchemaView.css';
import '@/styles/Splitter.css';

import SchemaView from "./components/SchemaView/SchemaView";
import Header from "./components/Layout/Header";
import { ThemeProvider } from "./contexts/ThemeContext";
import CreateProjectWizard from "./components/Project/CreateProjectWizard";
import OpenProjectModal from "./components/Project/OpenProjectModal";
import ConnectionsModal from "./components/Project/ConnectionsModal";
import MarkLogicConnectionsModal from "./components/Project/MarkLogicConnectionsModal";
import MigrationWizard from "./components/Migration/MigrationWizard";
import MigrationProgressView from "./components/Migration/MigrationProgressView";
import { ProjectData, DiagramContainer, getProject, saveProject } from "./services/ProjectService";
import { DeploymentJob } from "./services/MigrationService";
import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";

export default function App() {
  const [showWizard, setShowWizard] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(true);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [showMarkLogicModal, setShowMarkLogicModal] = useState(false);
  const [showMigrationWizard, setShowMigrationWizard] = useState(false);
  const [activeJobForProgress, setActiveJobForProgress] = useState<DeploymentJob | null>(null);
  const [openProjects, setOpenProjects] = useState<ProjectData[]>([]);
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);
  const openProjectsRef = useRef<ProjectData[]>([]);
  openProjectsRef.current = openProjects;

  const openProject = (project: ProjectData) => {
    setOpenProjects((prev) => {
      const without = prev.filter((p) => p.name !== project.name);
      return [...without, project];
    });
    setActiveProjectName(project.name);
    setShowOpenModal(false);
  };

  const handleProjectSaved = async (projectId: string) => {
    setShowWizard(false);
    try {
      const project = await getProject(projectId);
      openProject(project);
    } catch (e) {
      console.error('Failed to load saved project:', e);
    }
  };

  const handleProjectSelect = (name: string) => {
    setActiveProjectName(name);
  };

  const handleProjectClose = (name: string) => {
    setOpenProjects((prev) => {
      const next = prev.filter((p) => p.name !== name);
      if (activeProjectName === name) {
        setActiveProjectName(next.length > 0 ? next[next.length - 1].name : null);
      }
      return next;
    });
  };

  const handleProjectSchemasUpdated = useCallback((project: ProjectData) => {
    setOpenProjects((prev) => prev.map((p) => p.name === project.name ? project : p));
  }, []);

  const handleDiagramChange = useCallback((projectName: string, reactNodes: ReactFlowNode[], reactEdges: ReactFlowEdge[]) => {
    const project = openProjectsRef.current.find((p) => p.name === projectName);
    if (!project) return;

    const diagram: DiagramContainer = {
      name: projectName,
      tabs: [{
        id: 'relational',
        name: 'Relational',
        relational: {
          nodes: reactNodes.map((n) => ({
            id: n.id,
            type: 'CARD',
            x: Math.round(n.position.x),
            y: Math.round(n.position.y),
            width: (n as any).measured?.width ?? 300,
            height: (n as any).measured?.height ?? 200,
            collapsed: (n.data as any)?.collapsed ?? false,
          })),
          edges: reactEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            startMarker: null,
            endMarker: null,
          })),
        },
        document: null,
      }],
    };

    const updatedProject: ProjectData = { ...project, diagrams: [diagram] };
    setOpenProjects((prev) => prev.map((p) => p.name === projectName ? updatedProject : p));
    saveProject(updatedProject).catch((e) => console.error('Failed to save diagram:', e));
  }, []);

  return (
    <ThemeProvider>
    <div className="App flex flex-column h-screen bg-[#f5f6f8] dark:bg-slate-800 font-mono color-white overflow-hidden">
      <Header
        onNewProject={() => setShowWizard(true)}
        onOpenProject={() => setShowOpenModal(true)}
        onConnections={() => setShowConnectionsModal(true)}
        onMarkLogicConnections={() => setShowMarkLogicModal(true)}
        onMigrate={() => setShowMigrationWizard(true)}
      />
      <SchemaView
        openProjects={openProjects}
        activeProjectName={activeProjectName}
        onProjectSelect={handleProjectSelect}
        onProjectClose={handleProjectClose}
        onDiagramChange={handleDiagramChange}
        onProjectSchemasUpdated={handleProjectSchemasUpdated}
        onProjectSettingsUpdated={handleProjectSchemasUpdated}
      />
      {showWizard && (
        <CreateProjectWizard
          onClose={() => setShowWizard(false)}
          onSaved={handleProjectSaved}
        />
      )}
      {showOpenModal && (
        <OpenProjectModal
          onOpen={openProject}
          onClose={() => setShowOpenModal(false)}
          onDeleted={handleProjectClose}
          onNewProject={() => setShowWizard(true)}
          alreadyOpenNames={openProjects.map((p) => p.name)}
        />
      )}
      {showConnectionsModal && (
        <ConnectionsModal onClose={() => setShowConnectionsModal(false)} />
      )}
      {showMarkLogicModal && (
        <MarkLogicConnectionsModal onClose={() => setShowMarkLogicModal(false)} />
      )}
      {showMigrationWizard && (
        <MigrationWizard
          onClose={() => setShowMigrationWizard(false)}
          onStarted={(job: DeploymentJob) => {
            setShowMigrationWizard(false);
            setActiveJobForProgress(job);
          }}
        />
      )}
      {activeJobForProgress && (
        <MigrationProgressView
          job={activeJobForProgress}
          onClose={() => setActiveJobForProgress(null)}
        />
      )}
    </div>
    </ThemeProvider>
  );
}
