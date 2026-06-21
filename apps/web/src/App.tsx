import type { Project } from '@chinatalent/shared';

// Placeholder data — real data will come from the API (see API_CONTRACT.md).
const projects: Project[] = [];

export default function App(): JSX.Element {
  return (
    <main>
      <h1>China Talent Bridge</h1>
      <p>{projects.length} open projects</p>
    </main>
  );
}
