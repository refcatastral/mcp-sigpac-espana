# mcp-sigpac-espana 🚜🌾

[![npm version](https://img.shields.io/npm/v/mcp-sigpac-espana.svg?color=22c55e)](https://www.npmjs.com/package/mcp-sigpac-espana)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Powered by RefCatastral](https://img.shields.io/badge/Powered%20by-RefCatastral.es-086654)](https://refcatastral.es)

Servidor oficial basado en el **Model Context Protocol (MCP)** para consultar datos agronómicos y parcelas agrícolas del **SIGPAC** (Sistema de Información Geográfica de Parcelas Agrícolas) en España, conectando directamente con los servicios web oficiales del **Fondo Español de Garantía Agraria (FEGA)** y del **Ministerio de Agricultura, Pesca y Alimentación (MAPA)**.

Desarrollado y mantenido por [RefCatastral.es](https://refcatastral.es).

---

## 🚀 ¿Qué permite hacer?

1. **Consultar Parcelas Rústicas y Recintos:** Obtiene la superficie admisible (ha y $m^2$), recintos de cultivo, pendiente media (%) y altitud.
2. **Identificación de Usos Agrarios (SIGPAC):** Traduce automáticamente códigos agrícolas oficiales: Olivar (`OL`), Viñedo (`VI`), Tierras Arables (`TA`), Frutales (`FY`), Pastos (`PR`/`PS`), etc.
3. **Elegibilidad de Ayudas PAC:** Informa de si el recinto es admisible para ayudas directas de la Política Agrícola Común (PAC) y ecorregímenes.
4. **Geocodificación Inversa GPS:** A partir de coordenadas WGS84 (latitud/longitud), localiza la parcela rústica y sus recintos agrícolas en cualquier punto de España.
5. **Cruce Catastro ↔ SIGPAC:** Convierte referencias catastrales rústicas de 14 y 20 dígitos en provincia, municipio, polígono y parcela con enlaces a la ficha de la finca en [RefCatastral.es](https://refcatastral.es).

---

## 📦 Instalación y Configuración

### 1. En Claude Desktop
Añade la siguiente configuración a tu archivo `claude_desktop_config.json`:
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sigpac-espana": {
      "command": "npx",
      "args": ["-y", "mcp-sigpac-espana@latest"]
    }
  }
}
```

### 2. En Claude Code (CLI)
```bash
claude mcp add sigpac-espana npx -y mcp-sigpac-espana@latest
```

### 3. En Cursor / Windsurf
En `Settings > Features > MCP > Add New MCP Server`:
* **Name:** `sigpac-espana`
* **Type:** `command`
* **Command:** `npx -y mcp-sigpac-espana`

O añade a tu `.cursor/mcp.json` o `mcp.json`:
```json
{
  "mcpServers": {
    "sigpac-espana": {
      "command": "npx",
      "args": ["-y", "mcp-sigpac-espana@latest"]
    }
  }
}
```

---

## 🛠️ Herramientas Disponibles

| Herramienta | Parámetros | Descripción |
| :--- | :--- | :--- |
| `consultar_parcela_sigpac` | `provincia`, `municipio`, `poligono`, `parcela` *(o `referencia_catastral`)* | Obtiene todos los recintos, usos, hectáreas, pendientes y enlace a RefCatastral. |
| `coordenadas_a_sigpac` | `latitud`, `longitud` | Geocodificación inversa de coordenadas a parcela SIGPAC. |
| `interpretar_uso_sigpac` | `codigo_uso` (ej. `OL`, `TA`, `VI`) | Explicación del cultivo, categoría y si es elegible para ayudas PAC. |
| `convertir_referencia_a_sigpac` | `referencia_catastral` | Desglose de referencia rústica en polígono y parcela. |

---

## 🔒 Privacidad y Rendimiento
* **0% servidores intermediarios:** Las consultas se realizan de forma directa y descentralizada a la infraestructura abierta de `sigpac-hubcloud.es`.
* **Caché y compresión:** Soporte nativo para respuestas comprimidas en GZIP.
* **Sin claves privadas:** No requiere registro previo ni API keys privadas.

---

## 📄 Licencia
Distribuido bajo licencia MIT. Desarrollado por [RefCatastral.es](https://refcatastral.es).
