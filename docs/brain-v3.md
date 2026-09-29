# Brain v3 — categorización automática sin IA y sin ML

> Estado: plan aprobable (2026-09-28), sobre `semaphore_v2` ya aplicado
> (migraciones `semaphore_v2_a` … `_k`). No cambia el contrato del semáforo:
> azul = verificado por una persona, nunca por la máquina.

## 1. Decisión: reglas + conteos + umbrales fijos

**Sin IA generativa y sin modelos entrenados.** Todo lo que decide el Brain
son reglas escritas, **conteos** de lo que confirmaron las personas y
**umbrales fijos documentados**. Cualquiera puede reproducir una decisión
con papel y lápiz.

- **Por qué es la mejor opción para LedgiProof:** cada decisión se puede
  explicar y auditar ("se confirmó 7 veces en Software"). No hay costo por
  transacción, funciona sin conexión a terceros, no envía datos financieros a
  ningún proveedor de IA y hace lo mismo hoy y mañana (reproducible).
- **Lo que se pierde:** un modelo acertaría más en comercios que la empresa
  nunca vio. Se compensa con un diccionario de comercios y palabras clave
  sembrado a mano, y preguntando en lugar de adivinar.

## 2. Lo que hay hoy (investigado 2026-09-28)

### Categorización: ¿a qué cuenta va?

| Pieza | Dónde | Estado |
|---|---|---|
| `lp_private.suggest_account` | Base (v2) | Cascada: regla → aprendido → proveedor → 28 semillas → primera cuenta de ingreso. **Gana la primera** que coincide, con confianzas fijas. |
| `learn_merchant` / `user_patterns` | Base (v2) | Aprende por `merchant_key` = las 2 primeras palabras sin números. `AMZN MKTP US*2K3` → `amzn mktp`, `AMAZON.COM*AB12` → `amazon ab`: el mismo comercio aprende por separado. |
| `auto_categorize_transactions` | Base (v2) | Postea solo regla, comercio confirmado 3 veces o match exacto. La llaman `plaid-sync` y la importación CSV. |
| **`suggest-categories`** | Edge function | **Usa Claude** para rellenar lo que el motor deja en blanco. La llaman For review web (`ReviewInbox.tsx:129`) y móvil (`review_screen.dart:140`). |
| `aiCategorizeSuggestion` | `learning.service.ts` | **Llama a Anthropic desde el navegador**; no tiene llamadores (código muerto). |

### Riesgo: ¿es un problema? (`risk_status`)

Reglas en `rule_definitions`: duplicado, sobre el límite, velocidad, sin
documento ≥ $75, desvío de presupuesto, proveedor nuevo.

| Origen de la transacción | ¿Se evalúa el riesgo? |
|---|---|
| Alta manual en la web | Sí, **en el navegador** (`brain.service.ts`), que luego escribe `risk_status`. Un usuario podría enviar `green` directamente. |
| Móvil (`create-transaction`) | Sí, con una **copia** del mismo código en la edge function. |
| Plaid (`plaid-sync`) | **No**: fija `risk_status = 'green'`. |
| Importación CSV | **No**. |

Resultado: el Brain de riesgo está **dos veces**, se puede saltar y no ve
los movimientos bancarios, que son la mayoría.

### Otros usos de IA, fuera de la categorización

Son decisiones aparte, no forman parte de este plan:

- `ocr-receipt`: Claude lee los recibos.
- `ai-query`: asistente de chat.
- Borrador de respuesta en el chat de transacciones.
- `cgc-evaluate`: servicio externo CGC.

Datos reales: 20 transacciones, 7 patrones aprendidos y 0 reglas. Es
entorno de pruebas.

## 3. Arquitectura

```
transacción (web, móvil, CSV, Plaid)
   │  BEFORE INSERT  ──▶ Brain de riesgo (en la base, uno solo) ─▶ risk_status + razones
   ▼
A. Identidad del comercio  ─▶ merchant_id estable
B. Evidencias              ─▶ candidatos con puntos y una frase cada uno
C. Puntuación fija         ─▶ cuenta ganadora, puntos, margen
D. Decisión                ─▶ postear (verde) · sugerir (ámbar, 1 clic) · preguntar (ámbar) · riesgo (rojo)
```

### A. Identidad del comercio (determinista)

1. **Limpieza:** mayúsculas/minúsculas, quitar prefijos de procesador
   (`SQ *`, `TST*`, `PAYPAL *`, `SP `, `DD *`, `AMZN MKTP`, `POS`,
   `CHECKCARD`), números de tienda (`#1234`), ciudad y estado finales,
   fechas, referencias y últimos 4 dígitos.
2. **Alias** (`lp_private.merchant_aliases`, sembrados a mano, ~300
   comercios de EE. UU.): patrón → comercio canónico.
3. **`merchant_entity_id` de Plaid:** si existe, es la identidad y le gana
   al texto. `plaid-sync` debe guardarlo, junto con la contraparte y la
   categoría detallada.
4. **Similitud de texto** (`pg_trgm`, ≥ 0.6) contra los comercios que la
   empresa ya tiene. Es una comparación de caracteres, no un modelo. Si hay
   un único parecido, se usa; si hay varios, no se adivina.
5. El usuario puede **unir** dos comercios ("esto es lo mismo que…"), y eso
   crea un alias para su empresa.

### B. Evidencias y puntos fijos

| Evidencia | Condición | Puntos | Frase que ve el usuario |
|---|---|---|---|
| Regla del usuario | Coincide comercio (+ rango de monto opcional) | Decide | "Regla: siempre X en Y" |
| Match exacto y único | Factura, pago o bill | Decide | "Pago de la factura #1042" |
| Transferencia propia | Monto opuesto en otra cuenta propia, ±3 días | Decide (no es ingreso ni gasto) | "Transferencia desde Ahorros" |
| Memoria | n confirmaciones de este comercio en esa cuenta | 20 × n, tope 100 | "Confirmado 7 veces en Software" |
| Rango de monto | El monto cae en el mín–máx visto para ese comercio en esa cuenta | +15 | "USD 49 dentro de lo habitual (45–55)" |
| Proveedor | Cuenta por defecto del vendor | 40 | "Cuenta por defecto de Acme" |
| Diccionario | Palabra clave o comercio conocido (semillas ampliadas) | 25 | "«hotel» suele ser Viajes" |
| Categoría del banco | PFC de Plaid mapeada | 15 (+10 si Plaid dice *very high*) | "El banco lo clasifica como Viajes" |
| Corrección reciente | El usuario cambió este comercio de esa cuenta a otra | −60 a la cuenta anterior | "Lo cambiaste la última vez" |

Se suman los puntos por cuenta. El **margen** es la diferencia entre la
primera cuenta y la segunda.

### C/D. Decisión

| Situación | Acción | Semáforo |
|---|---|---|
| Regla, match exacto o transferencia | Postea | Verde |
| ≥ 100 puntos, margen ≥ 60 **y** precisión medida del comercio ≥ 98 % (con al menos 3 confirmaciones) | Postea sola | Verde |
| 40–99 puntos | Sugerencia preseleccionada, 1 clic | Ámbar |
| < 40 puntos o margen < 20 | Pregunta sin preseleccionar | Ámbar |
| Alguna regla de riesgo *critical* | Nunca postea sola | Rojo |

**Precisión medida** = de las veces que el Brain sugirió o posteó este
comercio en los últimos 90 días, cuántas no se corrigieron. Es una división,
no un modelo.

## 4. Explicación sellada: el diferenciador

Cada sugerencia lleva `evidence jsonb` (la tabla de arriba con sus frases).
La interfaz la muestra en **"¿Por qué?"**, en web y móvil. Al postear, la
evidencia se guarda en `audit_events`, la cadena de hashes de la
transacción, así que cualquiera puede ver después qué sabía el sistema y
por qué decidió así.

## 5. Aprendizaje seguro

- Solo cuentan las confirmaciones de **personas** (For review, Verify,
  corrección). Los auto-posteos nunca cuentan como aprendizaje.
- Una corrección resta puntos y **quita la graduación** al comercio hasta
  que se confirme 3 veces más.
- Las firmas tienen aislamiento por cliente, como hoy.

## 6. Fases

| Fase | Qué | Resultado visible |
|---|---|---|
| **F0 — Un solo Brain** | Reglas de riesgo como trigger `BEFORE INSERT` en la base, para todos los orígenes (web, móvil, CSV, Plaid) y sin posibilidad de saltarlo. Borrar la copia del navegador y de `create-transaction`. **Quitar la IA de la categorización** (`suggest-categories` en web y móvil, `aiCategorizeSuggestion`). | Plaid y CSV por fin pasan por las reglas; cero IA al categorizar. |
| **F1 — Identidad del comercio** | Limpieza, alias sembrados, `pg_trgm`, datos de Plaid en `plaid-sync`, migrar `user_patterns` a `merchant_id`, "unir comercios". | Amazon aprende como un solo comercio. |
| **F2 — Evidencias y "¿Por qué?"** | `brain_candidates` con la tabla de puntos, reemplazando `suggest_account`; `evidence` en For review web y móvil; sellado en auditoría. | Cada sugerencia dice por qué. |
| **F3 — Automatización medida** | Precisión por comercio, degradación por corrección, transferencias, rango de monto. | Postea solo lo que ha demostrado acertar. |
| **F4 — Métricas** | Cobertura, precisión y tiempo ahorrado por mes; reglas de anomalía deterministas (monto > 3× la mediana del comercio, comercio nuevo con monto alto). | "El Brain categorizó 312 movimientos con 99 % de precisión." |

Cada fase pasa por `scripts/db-health` y por pruebas en una transacción que
se deshace, igual que los arreglos de hoy.

## 7. Referencias

- [QuickBooks: sugerencias](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/ai-suggestions-help-match-categorize-bank/L8FHOh4AD_US_en_US)
- [Xero: Rule, Match, Memory, Prediction](https://www.xero.com/us/media-releases/xero-unveils-the-next-evolution-of-bank-reconciliation/)
- [Plaid: campos de la transacción (merchant_entity_id, PFC, confidence)](https://plaid.com/docs/api/products/transactions/)
- [Plaid: limpiar descripciones bancarias](https://plaid.com/blog/making-sense-of-messy-data/)
