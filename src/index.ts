import index_html from "../static/index.html";
import index_css from "../static/index.css";
import index_js from "../static/index.js";
import sodium_js from "../static/sodium.js";

export async function handleRequest(request: Request, env: Bindings) {
  // Match route against pattern /:name/*action
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return new Response(index_html, {
      headers: { "content-type": "text/html" },
    });
  } else if (url.pathname === "/index.css") {
    return new Response(index_css, { headers: { "content-type": "text/css" } });
  } else if (url.pathname === "/index.js") {
    return new Response(index_js, {
      headers: { "content-type": "text/javascript" },
    });
  } else if (url.pathname === "/sodium.js") {
    return new Response(sodium_js, {
      headers: { "content-type": "text/javascript" },
    });
  }
  if (url.pathname.startsWith("/api/connect")) {
    const match = /\/(?<name>[^\/]+)\/(?<endpoint>[^\/]+)\/(?<action>.*)/.exec(
      url.pathname
    );
    if (!match?.groups) {
      // If we didn't specify a name, default to "test"
      console.log("No match");
      return Response.redirect(`${url.origin}`, 302);
    }
    console.log("Forwarding to Durable Object: " + match.groups.action);
    // Forward the request to the named Durable Object...
    const { WEBSOCKET } = env;
    const id = WEBSOCKET.idFromName(match.groups.action);
    const stub = WEBSOCKET.get(id);
    // ...removing the name prefix from URL
    url.pathname = match.groups.action;
    return stub.fetch(url.toString(), request);
  }
  return new Response("Not Found", { status: 404 });
}

const worker: ExportedHandler<Bindings> = { fetch: handleRequest };

// Make sure we export the Counter Durable Object class
export { Websocket } from "./Websocket";
export default worker;
