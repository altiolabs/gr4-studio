export function readExplicitPlotPanelTitle(parameters: Readonly<Record<string, string>> | undefined): string | undefined {
  if (!parameters) {
    return undefined;
  }

  for (const key of ['plot_title', 'title'] as const) {
    const value = parameters[key];
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}
