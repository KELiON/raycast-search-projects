import { Action, ActionPanel, closeMainWindow, List, getPreferenceValues } from "@raycast/api";
import { useFrecencySorting, useCachedPromise } from "@raycast/utils";
import { spawn } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";
import { useState, useMemo, useRef } from "react";
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

// Async function to get projects
async function getProjects(directory: string): Promise<Project[]> {
  try {
    return readdirSync(directory).map((folder) => ({
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

  const { data: projects = [], isLoading } = useCachedPromise(getProjects, [preferences.projectsDirectory], {
    initialData: [],
    keepPreviousData: true,
  });

  const {
    data: sortedProjects,
    visitItem,
    resetRanking,
  } = useFrecencySorting(projects, {
    key: (item: Project) => item.path,
    sortUnvisited: (a: Project, b: Project) => a.name.localeCompare(b.name),
  });

  const [searchText, setSearchText] = useState("");

  const filteredProjects = useMemo(() => {
    const searchRgx = new RegExp([...searchText].map(escapeRegex).join(".*"), "i");

    return sortedProjects
      .filter((item) => searchRgx.test(item.name))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const search = searchText.toLowerCase();

        if (aName === search) {
          if (aName === bName) return 0;
          return -1;
        }
        if (bName === search) return 1;

        return +bName.includes(search) - +aName.includes(search);
      });
  }, [searchText, sortedProjects]);

  return (
    <List
      filtering={false}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search projects..."
      isLoading={isLoading}
    >
      {filteredProjects.map((project) => (
        <ProjectListItem key={project.path} project={project} updateFrecency={{ visitItem, resetRanking }} />
      ))}
    </List>
  );
}

function ProjectListItem({
  project,
  updateFrecency,
}: {
  project: Project;
  updateFrecency: FrecencyUpdateType<Project>;
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

                const child = spawn("e", [project.path], {
                  stdio: "inherit",
                  env: { ...process.env, ...env },
                });

                closeMainWindow();
              }}
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
