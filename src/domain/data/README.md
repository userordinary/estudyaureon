# src/domain/data

Datos de dominio extraídos de `legacy/PREE.html` (copia de `AUREON.html`, la "Bitácora CEPREUNMSM" v4).
Se validan con Zod en `index.ts` al cargar. No se portó nada del panel "Análisis Avanzado".

| JSON                     | Variable del legacy         | Notas                                                                                                                                                                                                       |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursos.json`            | `AREAS` (+ ids de `seed()`) | `bloque` y `color` salen de `AREAS[].name` / `AREAS[].color`. `seccion` (habilidades/conocimientos) sigue el PROMPT 0. Los ids (`hv`, `quim`, …) reemplazan a los `c1…c19` del legacy.                      |
| `temario.json`           | `TOPICS`                    | `semana` sale del prefijo `S#`. Id estable: `<curso>-s<NN>-<2 palabras>` (p. ej. `quim-s03-enlace-quimico`). Todo `verificado: false` hasta contrastarlo con el prospecto oficial. Los ids no se regeneran. |
| `carreras.json`          | `CAREERS_DB`                | `id` = slug del nombre. `cepreFirst`/`cepreLast` = [e1, e2, e3, e4, total]; `null` = sin datos oficiales (se estima en `benchmarks.ts`).                                                                    |
| `pesos-area.json`        | `AREA_PRESETS`              | Solo los 17 cursos de Conocimientos (suman 70 por área). Se quitaron HV/HM (10+10): viven en `reglas-evaluacion.json` porque dependen de la evaluación.                                                     |
| `reglas-evaluacion.json` | `EVAL_RULES`                | `good`→`buena`, `bad`→`mala`, `weeks`→`semanas`, `hasAct`→`actitudinal` (0 o 10 preguntas).                                                                                                                 |

> [!WARNING]
> En el legacy, el total de `cepreLast` no coincide con la suma de sus 4 evaluaciones en 3 carreras:
> Ciencia de la Computación (−2), Arquitectura y Urbanismo (−18) e Ing. Mecánica de Fluidos (+1).
> No se corrigió (pendiente de contrastar con el reporte oficial); un test fija esta lista.
