import { Action, ActionPanel, closeMainWindow, List, getPreferenceValues } from "@raycast/api";
import { useFrecencySorting, useCachedPromise } from "@raycast/utils";
import { spawn } from "child_process";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { useState, useMemo, useEffect } from "react";
import { shellEnv } from "shell-env";

interface Preferences {
  projectsDirectory: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
}

type FrecencyReturnType<T extends { id: string }> = ReturnType<typeof useFrecencySorting<T>>;
type FrecencyUpdateType<T extends { id: string }> = Pick<FrecencyReturnType<T>, "visitItem" | "resetRanking">;

const EXCLUDE_FOLDERS = ["node_modules"];

// Async function to get projects
async function getProjects(directory: string): Promise<Project[]> {
  try {
    return readdirSync(directory)
      .filter((folder) => {
        try {
          return (
            statSync(join(directory, folder)).isDirectory() &&
            !folder.startsWith(".") &&
            !EXCLUDE_FOLDERS.includes(folder)
          );
        } catch {
          return false;
        }
      })
      .map((folder) => ({
        id: join(directory, folder),
        name: folder,
        path: join(directory, folder),
      }));
  } catch (error) {
    console.error("Error reading directory:", error);
    return [];
  }
}

function escapeRegex(x: string): string {
  return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [query, setQuery] = useState("");

  const parts = query.split("/");
  const currentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  const searchTerm = parts[parts.length - 1];

  const { data: projects = [], isLoading } = useCachedPromise(
    (dir) => getProjects(dir),
    [join(preferences.projectsDirectory, currentPath)],
    {
      initialData: [],
      keepPreviousData: true,
    },
  );

  const {
    data: sortedProjects,
    visitItem,
    resetRanking,
  } = useFrecencySorting(projects, {
    key: (item: Project) => item.path,
    sortUnvisited: (a: Project, b: Project) => a.name.localeCompare(b.name),
  });

  const filteredProjects = useMemo(() => {
    const searchRgx = new RegExp([...searchTerm].map(escapeRegex).join(".*"), "i");

    return sortedProjects
      .filter((item) => searchRgx.test(item.name))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const search = searchTerm.toLowerCase();

        if (aName === search) {
          if (aName === bName) return 0;
          return -1;
        }
        if (bName === search) return 1;

        return +bName.includes(search) - +aName.includes(search);
      });
  }, [searchTerm, sortedProjects]);

  return (
    <List
      filtering={false}
      onSearchTextChange={setQuery}
      searchText={query}
      searchBarPlaceholder="Search projects... (use / for subdirectories)"
      isLoading={isLoading}
    >
      {filteredProjects.map((project) => (
        <ProjectListItem
          key={project.path}
          project={project}
          updateFrecency={{ visitItem, resetRanking }}
          searchInProject={() => setQuery(`${join(currentPath, project.name)}/`)}
        />
      ))}
    </List>
  );
}

function ProjectListItem({
  project,
  updateFrecency,
  searchInProject,
}: {
  project: Project;
  updateFrecency: FrecencyUpdateType<Project>;
  searchInProject: () => void;
}) {
  const { visitItem, resetRanking } = updateFrecency;

  return (
    <List.Item
      title={project.name}
      icon={{ fileIcon: project.path }}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title="Open in Editor"
              onAction={async () => {
                visitItem(project);
                const env = await shellEnv();

                spawn("e", [project.path], {
                  stdio: "inherit",
                  env: { ...process.env, ...env },
                });

                closeMainWindow();
              }}
            />
            <Action
              title="Search in This Project"
              onAction={searchInProject}
              shortcut={{ modifiers: [], key: "tab" }}
            />
            <Action.ShowInFinder path={project.path} shortcut={{ modifiers: ["cmd"], key: "f" }} />
            <Action.CopyToClipboard
              title="Copy Path"
              content={project.path}
              shortcut={{ modifiers: ["cmd"], key: "." }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Reset Project Ranking"
              onAction={() => resetRanking(project)}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
