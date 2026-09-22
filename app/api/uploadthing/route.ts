import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

// Aman di-build tanpa UPLOADTHING_TOKEN: handler hanya jalan saat dipanggil.
export const { GET, POST } = createRouteHandler({ router: ourFileRouter });
