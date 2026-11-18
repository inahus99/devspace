// Railway infrastructure for DevSpace (replaces the old railway.json Config as Code).
// Preview with `railway config plan`, apply with `railway config apply`.
// Variables are unmanaged: DATABASE_URL, SESSION_SECRET etc. live only in Railway, never in this file.
import { defineRailway, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "asia-southeast1-eqsg3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };

  const alerts = { usage: { "100": {}, "80": {}, "95": {} } };
  // Uploaded images & files (UPLOAD_DIR=/data/uploads). Do not remove: dropping it from this file deletes it on apply.
  const devspaceVolume = volume("devspace-volume", { alerts, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });
  const postgresVolume = volume("postgres-volume", { alerts, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });

  const devspace = service("devspace", {
    build: { builder: "NIXPACKS", buildEnvironment: "V3", buildCommand: "npm run build" },
    // Runs pending migrations, then serves the API + SPA.
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "asia-southeast1-eqsg3a": 1 },
    volumeMounts: { "/data": devspaceVolume },
  });

  return project("devspace", {
    variables: { managed: false },
    resources: [devspace, Postgres, devspaceVolume, postgresVolume],
  });
});
