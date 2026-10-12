import { z } from "zod";
import exception from "./exception.json";

const severity = z.enum(["info", "low", "moderate", "high", "critical"]);
const advisory = z.object({ url: z.url(), name: z.string(), severity });
const vulnerability = z.object({
  severity,
  nodes: z
    .array(z.string())
    .min(1)
    .max(100)
    .refine((nodes) => new Set(nodes).size === nodes.length, {
      message: "nodes must be unique",
    }),
  via: z
    .array(z.union([z.string(), advisory]))
    .min(1)
    .max(100)
    .refine(
      (via) =>
        new Set(
          via.map((cause) =>
            typeof cause === "string" ? `package:${cause}` : `advisory:${cause.url}`
          )
        ).size === via.length,
      { message: "via entries must be unique" }
    ),
});
const reportSchema = z.object({ vulnerabilities: z.record(z.string(), vulnerability) });
const lockSchema = z.object({
  packages: z.record(
    z.string(),
    z.object({
      version: z.string().optional(),
      dev: z.boolean().optional(),
    })
  ),
});

/** Follow advisory causes, rather than exempting a package with unrelated flaws. */
export function evaluateDependencyAudit(
  reportInput: unknown,
  lockInput: unknown,
  now = new Date()
) {
  const report = reportSchema.parse(reportInput);
  const lock = lockSchema.parse(lockInput);
  const active = now.getTime() < Date.parse(exception.expiresAt);
  const accepts = (name: string, visited = new Set<string>()): boolean => {
    if (!active || visited.has(name) || !exception.affectedPackages.includes(name))
      return false;
    const item = report.vulnerabilities[name];
    if (!item || item.severity !== exception.severity) return false;
    if (
      !item.nodes.every(
        (node) =>
          lock.packages[node]?.dev === true &&
          (name !== exception.package ||
            lock.packages[node]?.version === exception.version)
      )
    )
      return false;
    const next = new Set(visited).add(name);
    return item.via.every((cause) =>
      typeof cause === "string"
        ? accepts(cause, next)
        : cause.url === exception.advisoryUrl &&
          cause.name === exception.package &&
          cause.severity === exception.severity &&
          name === exception.package
    );
  };
  const blocking: string[] = [];
  const accepted: string[] = [];
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    if (item.severity === "info" || item.severity === "low") continue;
    if (accepts(name)) accepted.push(name);
    else blocking.push(name);
  }
  return { blocking, accepted, exception };
}
