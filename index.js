#!/usr/bin/env node

/**
 * mcp-sigpac-espana — Servidor MCP Oficial de RefCatastral.es para SIGPAC y Fincas Rústicas
 * 
 * Permite a modelos de IA (Claude, Cursor, ChatGPT, etc.) consultar datos oficiales
 * del Sistema de Información Geográfica de Parcelas Agrícolas (SIGPAC) del MAPA y FEGA
 * en España: recintos agrícolas, usos (olivar, viñedo, regadío, pastos), pendientes,
 * altitud y coeficientes de ayudas PAC.
 * 
 * 100% descentralizado · Consultas directas a los servicios abiertos de SIGPAC Cloud.
 * 
 * Desarrollado por RefCatastral.es (https://refcatastral.es)
 */

import zlib from "node:zlib";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── Diccionario Oficial de Usos Agrícolas SIGPAC (FEGA / MAPA) ───────────────
const USOS_SIGPAC = {
  TA: { nombre: "Tierras Arables", desc: "Cultivos herbáceos en secano o regadío (cereal, leguminosas, girasol, etc.)", categoria: "Agrícola", elegible_pac: true },
  TH: { nombre: "Huerta", desc: "Cultivos hortícolas intensivos en regadío", categoria: "Hortícola", elegible_pac: true },
  VI: { nombre: "Viñedo (Secano)", desc: "Uva para vinificación o mesa en régimen de secano", categoria: "Leñoso", elegible_pac: true },
  VF: { nombre: "Viñedo (Regadío)", desc: "Uva para vinificación o mesa con infraestructura de riego", categoria: "Leñoso", elegible_pac: true },
  OL: { nombre: "Olivar (Secano)", desc: "Olivos destinados a aceituna de almazara o mesa en secano", categoria: "Leñoso", elegible_pac: true },
  OF: { nombre: "Olivar (Regadío)", desc: "Olivos con riego por goteo o aspersión", categoria: "Leñoso", elegible_pac: true },
  FY: { nombre: "Frutales (Secano)", desc: "Árboles frutales de hoja caduca o perenne en secano", categoria: "Leñoso", elegible_pac: true },
  FF: { nombre: "Frutales (Regadío)", desc: "Árboles frutales con riego localizado", categoria: "Leñoso", elegible_pac: true },
  CI: { nombre: "Cítricos (Secano)", desc: "Naranjos, mandarinos, limoneros en secano", categoria: "Cítricos", elegible_pac: true },
  CF: { nombre: "Cítricos (Regadío)", desc: "Cítricos en producción intensiva de regadío", categoria: "Cítricos", elegible_pac: true },
  FS: { nombre: "Frutos Secos (Secano)", desc: "Almendros, avellanos, nogales, pistacheros en secano", categoria: "Leñoso", elegible_pac: true },
  FL: { nombre: "Frutos Secos (Regadío)", desc: "Frutos secos con riego", categoria: "Leñoso", elegible_pac: true },
  PR: { nombre: "Pastizal", desc: "Pastos naturales sin arbolado para alimentación ganadera", categoria: "Ganadero / Pastos", elegible_pac: true },
  PS: { nombre: "Pastos Arbolados", desc: "Dehesas y superficies pastables con arbolado disperso (encinar, alcornocal)", categoria: "Dehesa / Pastos", elegible_pac: true },
  PA: { nombre: "Pastos Arbustivos", desc: "Matorral pastable o pastos con cobertura de matorral", categoria: "Ganadero / Pastos", elegible_pac: true },
  FO: { nombre: "Forestal", desc: "Montes arbolados y masas forestales no pastables", categoria: "Forestal", elegible_pac: false },
  ED: { nombre: "Edificación / Construcción", desc: "Casas rurales, naves agrícolas, almacenes o construcciones fijas", categoria: "Inmueble / Suelo no agrícola", elegible_pac: false },
  AG: { nombre: "Corrientes y Masas de Agua", desc: "Ríos, arroyos, embalses, charcas o balsas de riego", categoria: "Hidrología", elegible_pac: false },
  CA: { nombre: "Vías de Comunicación", desc: "Caminos rurales, carreteras, vías férreas o servidumbres de paso", categoria: "Infraestructuras", elegible_pac: false },
  IM: { nombre: "Improductivo", desc: "Terrenos rocosos, cárcavas o áreas sin posibilidad de aprovechamiento", categoria: "Improductivo", elegible_pac: false },
  ZU: { nombre: "Zona Urbana", desc: "Núcleos urbanos consolidados en suelo de naturaleza urbana", categoria: "Urbano", elegible_pac: false },
  ZV: { nombre: "Zona Verde", desc: "Parques, jardines o zonas verdes de recreo", categoria: "Dotacional", elegible_pac: false },
};

// ── Cliente HTTP para SIGPAC Cloud con Descompresión GZIP ───────────────────
async function fetchSigpacJson(url) {
  const headers = {
    "User-Agent": "RefCatastral-SIGPAC/1.0 (+https://refcatastral.es)",
    "Accept": "application/json, text/plain, */*",
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Error HTTP SIGPAC (${res.status}): ${res.statusText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  let text;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    text = zlib.gunzipSync(buf).toString("utf-8");
  } else {
    text = buf.toString("utf-8");
  }

  return JSON.parse(text);
}

// ── Parser de Referencia Catastral Rústica ──────────────────────────────────
function parseRusticRefCat(rc) {
  const clean = (rc || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (clean.length < 14) return null;

  // Formato rústico habitual: PPMUUUSPPPZZZZZ...
  const prov = parseInt(clean.substring(0, 2), 10);
  const mun = parseInt(clean.substring(2, 5), 10);
  const sector = clean.substring(5, 6);
  const pol = parseInt(clean.substring(6, 9), 10);
  const parc = parseInt(clean.substring(9, 14), 10);

  if (isNaN(prov) || isNaN(mun) || isNaN(pol) || isNaN(parc)) return null;

  return {
    provincia: prov,
    municipio: mun,
    sector: sector,
    poligono: pol,
    parcela: parc,
    referencia: clean,
  };
}

// ── Lógica de Consultas SIGPAC ──────────────────────────────────────────────
async function getParcelaRecintos(provincia, municipio, poligono, parcela, agregado = 0, zona = 0) {
  const pr = parseInt(provincia, 10);
  const mu = parseInt(municipio, 10);
  const ag = parseInt(agregado, 10) || 0;
  const zo = parseInt(zona, 10) || 0;
  const po = parseInt(poligono, 10);
  const pa = parseInt(parcela, 10);

  const url = `https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfoparc/${pr}/${mu}/${ag}/${zo}/${po}/${pa}.json`;
  const rawList = await fetchSigpacJson(url);

  if (!Array.isArray(rawList) || rawList.length === 0) {
    return {
      encontrado: false,
      mensaje: `No se encontraron recintos en SIGPAC para Provincia ${pr}, Municipio ${mu}, Polígono ${po}, Parcela ${pa}.`,
    };
  }

  let supTotalHa = 0;
  const recintos = rawList.map((r) => {
    const supHa = parseFloat(r.superficie || 0);
    supTotalHa += supHa;
    const usoCode = (r.uso_sigpac || "").toUpperCase();
    const infoUso = USOS_SIGPAC[usoCode] || { nombre: "Otro uso", desc: usoCode, categoria: "Sin catalogar", elegible_pac: false };

    return {
      recinto: r.recinto,
      superficie_hectareas: supHa,
      superficie_m2: Math.round(supHa * 10000),
      codigo_uso: usoCode,
      uso_nombre: infoUso.nombre,
      uso_descripcion: infoUso.desc,
      categoria: infoUso.categoria,
      elegible_ayudas_pac: infoUso.elegible_pac,
      pendiente_media_pct: r.pendiente_media,
      coeficiente_regadio_pct: r.coef_regadio,
      altitud_metros: r.altitud,
      admisibilidad_pastos: r.admisibilidad,
    };
  });

  // Reconstruir posible referencia catastral rústica de 14 caracteres
  const pStr = String(pr).padStart(2, "0");
  const mStr = String(mu).padStart(3, "0");
  const polStr = String(po).padStart(3, "0");
  const parcStr = String(pa).padStart(5, "0");
  const rcRústica14 = `${pStr}${mStr}A${polStr}${parcStr}`;

  return {
    encontrado: true,
    provincia: pr,
    municipio: mu,
    agregado: ag,
    zona: zo,
    poligono: po,
    parcela: pa,
    superficie_total_hectareas: Math.round(supTotalHa * 10000) / 10000,
    superficie_total_m2: Math.round(supTotalHa * 10000),
    total_recintos: recintos.length,
    recintos: recintos,
    visor_oficial_sigpac: `https://sigpac.mapa.gob.es/fega/visor/?p=${pr}&m=${mu}&ag=${ag}&z=${zo}&po=${po}&pa=${pa}`,
    enlace_refcatastral: `https://refcatastral.es/referencia/${rcRústica14}`,
    fuente: "SIGPAC · Fondo Español de Garantía Agraria (FEGA) / MAPA",
  };
}

async function getSigpacByCoords(latitud, longitud) {
  const lat = parseFloat(latitud);
  const lon = parseFloat(longitud);
  if (isNaN(lat) || isNaN(lon)) {
    throw new Error("Coordenadas no válidas (latitud y longitud deben ser números)");
  }

  // Consulta por BBOX centrado en las coordenadas (~50 metros de radio)
  const d = 0.0006;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const url = `https://sigpac-hubcloud.es/ogcapi/collections/recintos/items?bbox=${bbox}&limit=5`;
  const geojson = await fetchSigpacJson(url);

  const features = geojson.features || [];
  if (features.length === 0) {
    return {
      encontrado: false,
      coordenadas: { latitud: lat, longitud: lon },
      mensaje: "No se identificó ninguna parcela rústica SIGPAC en las coordenadas indicadas.",
    };
  }

  const props = features[0].properties;
  const detalle = await getParcelaRecintos(
    props.provincia,
    props.municipio,
    props.poligono,
    props.parcela,
    props.agregado,
    props.zona
  );

  return {
    ...detalle,
    coordenadas_consulta: { latitud: lat, longitud: lon },
    recinto_coincidente: props.recinto,
  };
}

// ── Servidor MCP Principal ──────────────────────────────────────────────────
const server = new Server(
  {
    name: "mcp-sigpac-espana",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Lista de Herramientas Expuestas ─────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "consultar_parcela_sigpac",
        description:
          "Consulta datos oficiales del SIGPAC (FEGA / MAPA) para una parcela rústica en España: lista de recintos, hectáreas, usos agrícolas (olivar, viñedo, tierras arables, pastos), pendiente media (%) y coeficiente de regadío. Admite los códigos numéricos de Provincia, Municipio, Polígono y Parcela o una Referencia Catastral rústica completa.",
        inputSchema: {
          type: "object",
          properties: {
            provincia: {
              type: "integer",
              description: "Código INE de la provincia (1 al 52, ej. 47 para Valladolid, 23 para Jaén, 41 para Sevilla).",
            },
            municipio: {
              type: "integer",
              description: "Código INE del municipio (1 al 999).",
            },
            poligono: {
              type: "integer",
              description: "Número del polígono rústico (ej. 1, 12, 105).",
            },
            parcela: {
              type: "integer",
              description: "Número de la parcela rústica (ej. 23, 9010).",
            },
            referencia_catastral: {
              type: "string",
              description: "Referencia catastral rústica (14 o 20 caracteres, ej. '47900A001000230000AB'). Si se proporciona, extrae provincia, municipio, polígono y parcela automáticamente.",
            },
          },
        },
      },
      {
        name: "coordenadas_a_sigpac",
        description:
          "Geocodificación inversa SIGPAC: Localiza la parcela agrícola, polígono, municipio y recintos correspondientes a unas coordenadas GPS (latitud y longitud en WGS84) en cualquier lugar de España.",
        inputSchema: {
          type: "object",
          properties: {
            latitud: {
              type: "number",
              description: "Latitud en grados decimales WGS84 (ej. 41.7051)",
            },
            longitud: {
              type: "number",
              description: "Longitud en grados decimales WGS84 (ej. -4.7071)",
            },
          },
          required: ["latitud", "longitud"],
        },
      },
      {
        name: "interpretar_uso_sigpac",
        description:
          "Diccionario oficial de usos agrícolas del SIGPAC (FEGA): explica el significado agronómico de cualquier código (TA, OL, VI, FY, PR, PA, FO, ED, etc.), su categoría, idoneidad de cultivos y si es elegible para ayudas directas de la PAC.",
        inputSchema: {
          type: "object",
          properties: {
            codigo_uso: {
              type: "string",
              description: "Código alfanumérico del uso SIGPAC de 2 letras (ej. 'OL', 'TA', 'VI', 'PR', 'PS', 'ED').",
            },
          },
          required: ["codigo_uso"],
        },
      },
      {
        name: "convertir_referencia_a_sigpac",
        description:
          "Convierte y desglosa una Referencia Catastral rústica de 14 o 20 dígitos en los componentes oficiales requeridos por SIGPAC: Provincia, Municipio, Sector/Agregado, Polígono y Parcela, facilitando el enlace directo a RefCatastral.es.",
        inputSchema: {
          type: "object",
          properties: {
            referencia_catastral: {
              type: "string",
              description: "Referencia catastral completa (ej. '23050A012000450000EK').",
            },
          },
          required: ["referencia_catastral"],
        },
      },
    ],
  };
});

// ── Ejecución de Herramientas ───────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "consultar_parcela_sigpac": {
        let pr = args?.provincia;
        let mu = args?.municipio;
        let po = args?.poligono;
        let pa = args?.parcela;

        if (args?.referencia_catastral) {
          const parsed = parseRusticRefCat(args.referencia_catastral);
          if (parsed) {
            pr = parsed.provincia;
            mu = parsed.municipio;
            po = parsed.poligono;
            pa = parsed.parcela;
          }
        }

        if (pr === undefined || mu === undefined || po === undefined || pa === undefined) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Error: Debes proporcionar los parámetros 'provincia', 'municipio', 'poligono' y 'parcela', o bien una 'referencia_catastral' rústica válida de 14 o 20 dígitos.",
              },
            ],
          };
        }

        const data = await getParcelaRecintos(pr, mu, po, pa);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "coordenadas_a_sigpac": {
        const data = await getSigpacByCoords(args.latitud, args.longitud);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "interpretar_uso_sigpac": {
        const code = (args.codigo_uso || "").toUpperCase().trim();
        const info = USOS_SIGPAC[code];
        if (!info) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    codigo: code,
                    encontrado: false,
                    mensaje: `El código de uso '${code}' no es un código estándar principal del SIGPAC. Consulta los códigos habituales: TA (Tierras Arables), OL (Olivar), VI (Viñedo), FY (Frutales), PR (Pastizal), ED (Edificación), FO (Forestal).`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ codigo: code, ...info }, null, 2),
            },
          ],
        };
      }

      case "convertir_referencia_a_sigpac": {
        const parsed = parseRusticRefCat(args.referencia_catastral);
        if (!parsed) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "La referencia catastral facilitada no parece corresponder a una finca rústica estándar (formato de 14 o 20 dígitos con polígono y parcela).",
              },
            ],
          };
        }

        const pStr = String(parsed.provincia).padStart(2, "0");
        const mStr = String(parsed.municipio).padStart(3, "0");
        const polStr = String(parsed.poligono).padStart(3, "0");
        const parcStr = String(parsed.parcela).padStart(5, "0");
        const rc14 = `${pStr}${mStr}A${polStr}${parcStr}`;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  referencia_original: parsed.referencia,
                  provincia_ine: parsed.provincia,
                  municipio_ine: parsed.municipio,
                  poligono: parsed.poligono,
                  parcela: parsed.parcela,
                  sector_agregado: parsed.sector,
                  enlace_visor_sigpac: `https://sigpac.mapa.gob.es/fega/visor/?p=${parsed.provincia}&m=${parsed.municipio}&po=${parsed.poligono}&pa=${parsed.parcela}`,
                  enlace_refcatastral: `https://refcatastral.es/referencia/${rc14}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Herramienta desconocida: '${name}'`,
            },
          ],
        };
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error ejecutando la herramienta ${name}: ${error.message}`,
        },
      ],
    };
  }
});

// ── Iniciar Servidor con Transporte STDIO ───────────────────────────────────
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Error fatal en el servidor mcp-sigpac-espana:", err);
  process.exit(1);
});
