/**
 * Test unitario para mcp-sigpac-espana
 */

import { spawn } from "node:child_process";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("=== INICIANDO TEST UNITARIO mcp-sigpac-espana ===");

const proc = spawn("node", ["index.js"], {
  cwd: __dirname,
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";

proc.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop(); // Mantener remanente incompleto

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      console.log("-> Mensaje recibido del servidor MCP:", msg.id || msg.method);

      if (msg.id === 1) {
        console.log("✅ tools/list OK:", msg.result.tools.map((t) => t.name).join(", "));
        
        // Ejecutar prueba de consultar_parcela_sigpac
        const callReq = {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "consultar_parcela_sigpac",
            arguments: {
              provincia: 47,
              municipio: 900,
              poligono: 1,
              parcela: 23,
            },
          },
        };
        proc.stdin.write(JSON.stringify(callReq) + "\n");
      }

      if (msg.id === 2) {
        const resText = msg.result.content[0].text;
        const resJson = JSON.parse(resText);
        console.log("✅ tools/call consultar_parcela_sigpac OK!");
        console.log("   Superficie total:", resJson.superficie_total_hectareas, "ha");
        console.log("   Recintos encontrados:", resJson.total_recintos);
        console.log("   Primer uso:", resJson.recintos[0].uso_nombre);
        console.log("   Enlace RefCatastral:", resJson.enlace_refcatastral);

        // Terminar proceso con éxito
        proc.kill();
        console.log("🎉 TEST COMPLETADO CON ÉXITO: 100% OPERATIVO");
        process.exit(0);
      }
    } catch (e) {
      console.error("Error parseando línea JSON-RPC:", e, line);
    }
  }
});

// Enviar solicitud de inicialización e inspección de herramientas
const initReq = {
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  },
};

const listReq = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {},
};

proc.stdin.write(JSON.stringify(initReq) + "\n");
proc.stdin.write(JSON.stringify(listReq) + "\n");
