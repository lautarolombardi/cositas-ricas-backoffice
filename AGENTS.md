# AGENTS.md

Reglas para agentes que trabajan en este frontend (React + Vite).

## Stack

- React 19 (componentes funcionales + hooks)
- Vite + TypeScript (ESM)
- Lint: `oxlint` (`pnpm lint`)
- Estilos: CSS por archivo / módulo existente; no introducir CSS-in-JS sin pedirlo
- Dependencias relevantes: TanStack Query, Sonner

No agregar librerías nuevas si el stack actual alcanza. Preferir APIs nativas y el código existente.

## Arquitectura feature-based

Organizar el código por **feature** (capacidad de negocio), no por tipo de archivo global.

```
src/
  features/
    <feature>/
      <Feature>Page.tsx      # pantalla / entrada de la feature
      <Component>.tsx        # UI propia de la feature
      use<Something>.ts      # hooks de la feature
      <feature>.api.ts       # llamadas HTTP específicas (si aplica)
      types.ts               # tipos solo de la feature (si aplica)
  components/                # UI reutilizable entre features
  lib/ o utilidades raíz     # helpers compartidos (format, session, etc.)
  api.ts                     # cliente HTTP / tipos compartidos con la API
  App.tsx
  main.tsx
```

### Reglas

- Código de un dominio vive en `src/features/<feature>/`.
- `src/components/` solo para piezas genéricas sin lógica de negocio de una feature.
- No crear carpetas globales `hooks/`, `services/`, `types/` para lógica de una feature: colocalizarlas dentro de esa feature.
- `App.tsx` orquesta rutas/sesión y monta features; no acumular UI de negocio ahí.
- Preferir imports directos al archivo (con extensión `.ts` / `.tsx`); evitar barrels (`index.ts`) salvo que ya existan y aporten valor claro.
- Una feature no debe importar internals privados de otra; compartir vía `components/`, `api.ts` o utilidades comunes.

### Ejemplo

```
# ✅ GOOD
src/features/products/ProductsPage.tsx
src/features/products/ProductFormSheet.tsx
src/features/products/prepareImage.ts

# ❌ BAD
src/components/ProductFormSheet.tsx   # es de products, no genérico
src/hooks/useProducts.ts              # va en features/products/
```

## Convenciones React + Vite

- TypeScript estricto; tipar props y respuestas de API.
- Hooks personalizados con prefijo `use`.
- Estado de servidor: TanStack Query cuando ya se use en la feature; no mezclar patrones rival sin motivo.
- Abortar fetches con `AbortController` en efectos que lo necesiten.
- Variables de entorno solo con prefijo `VITE_`; documentar en `.env.example`.
- No commitear secretos ni `.env` / `.env.local`.
- Mantener componentes enfocados; extraer subcomponentes o hooks dentro de la misma feature.
- Textos de UI en español, coherentes con el resto de la app.

## Al cambiar código

- Seguir el estilo y nombres del código vecino.
- No refactorizar fuera del alcance del pedido.
- Tras cambios sustanciales, verificar con `pnpm lint` y `pnpm build` si el cambio lo amerita.
