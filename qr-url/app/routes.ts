import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("dashboard/create", "routes/dashboard.create.tsx"),
  route("dashboard/qr/new", "routes/dashboard.qr.new.tsx"),
  route("dashboard/analytics/:urlId", "routes/dashboard.analytics.$urlId.tsx"),
  route("api/qr-image/*", "routes/api.qr-image.$.tsx"),

] satisfies RouteConfig;
