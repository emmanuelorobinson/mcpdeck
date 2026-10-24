const processes = [
  Bun.spawn(["bun", "run", "--cwd", "apps/api", "dev"], {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  }),
  Bun.spawn(["bun", "run", "--cwd", "apps/web", "dev"], {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  }),
];

const shutdown = () => {
  for (const proc of processes) proc.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.all(processes.map((proc) => proc.exited));
