# Brain v3 — categorización automática sin IA generativa

> Estado: propuesta de diseño (2026-09-28). Se construye **sobre** `semaphore_v2`
> (la otra sesión), no en paralelo. No cambia el significado del semáforo:
> azul = verificado por una persona, nunca por la máquina.

## 1. La idea en una frase

Un motor **determinista, explicable y auditable** que aprende de cada
confirmación de la empresa y combina varias evidencias para categorizar.
Siempre dice **por qué** eligió una cuenta y sella esa explicación en la
cadena de auditoría. No hay LLM ni caja negra: son estadística y reglas
dentro de Postgres.

Ese es el diferenciador frente a QuickBooks y Xero. Ellos sugieren, pero no
explican. LedgiProof sugiere, explica, mide su propia precisión y solo se
automatiza donde ha demostrado que acierta.

## 2. Qué hacen los demás (y qué copiamos)

| Producto | Cómo lo hace | Lección |
|---|---|---|
| QuickBooks Online | Sugiere según el historial y el payee; reglas bancarias; aprende de cada corrección ([Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/ai-suggestions-help-match-categorize-bank/L8FHOh4AD_US_en_US)) | El payee (comercio) bien identificado es la señal más fuerte. |
| Xero | Cuatro métodos por orden: **Rule, Match, Memory, Prediction**. La predicción aprende de toda la comunidad Xero, pero solo muestra cuentas del plan propio ([Xero blog](https://blog.xero.com/product-updates/behind-the-tech-bank-rec-predictions/), [Xero](https://www.xero.com/us/media-releases/xero-unveils-the-next-evolution-of-bank-reconciliation/)) | Capas en orden, y un conocimiento de comunidad para el primer día. |
| Plaid | Limpia las descripciones y extrae el comercio (`merchant_entity_id`), la contraparte y la categoría PFC con **nivel de confianza** ([Plaid docs](https://plaid.com/docs/api/products/transactions/), [Plaid blog](https://plaid.com/blog/making-sense-of-messy-data/)) | Hoy guardamos solo `primary`; estamos tirando la mejor señal gratuita. |
| Investigación | Naive Bayes / SVM sobre el texto normalizado logran un 85–95 % en comercios conocidos ([ResearchGate](https://www.researchgate.net/publication/343280103_Extraction_of_Bank_Transaction_Data_and_Classification_using_Naive_Bayes), [arXiv](https://arxiv.org/html/2305.18430v2)) | Un modelo simple y bien alimentado basta; lo difícil es normalizar y saber cuándo **no** decidir. |

## 3. Qué tiene hoy `semaphore_v2` y dónde se queda corto

Hoy: regla → aprendido → proveedor → semillas → ingreso. **Gana la primera
fuente que coincide**, con confianzas fijas (99, 70 + 8·n, 85, 60, 40). Un
comercio se gradúa tras 3 confirmaciones seguidas.

Límites:

1. **Identidad del comercio frágil.** `merchant_key` toma las dos primeras
   palabras sin números: `AMZN MKTP US*2K3` → `amzn mktp`, pero
   `AMAZON.COM*AB12` → `amazon ab`. Son dos comercios para el mismo
   proveedor, y cada uno aprende por separado.
2. **No combina evidencias.** Si el comercio sugiere "Software" y el monto
   (USD 2,400) sugiere "Equipo", gana el primero sin mirar el segundo.
3. **Confianzas inventadas.** Un 94 no significa "acierta 94 de cada 100"
   en esta empresa.
4. **Ciego al monto.** Amazon a USD 30 es material de oficina y a USD 1,800 es
   equipo; hoy aprende una sola cuenta por comercio.
5. **No detecta transferencias** entre cuentas propias. Es la fuente clásica
   de ingresos y gastos falsos.
6. **No explica** la sugerencia.

## 4. Arquitectura: cuatro etapas

```
transacción ─▶ A. Identidad ─▶ B. Evidencias ─▶ C. Combinación ─▶ D. Decisión ─▶ semáforo
                 (quién es)     (qué sugiere      (cuánto creer    (postear, sugerir
                                 cada señal)       en cada cuenta)   o preguntar)
```

### A. Identidad del comercio

1. **Limpieza** del texto: quitar prefijos de procesadores (`SQ *`, `TST*`,
   `PAYPAL *`, `SP `, `AMZN MKTP`), números de tienda, ciudad/estado,
   últimos 4 dígitos de tarjeta, fechas y referencias.
2. **Alias** (`lp_private.merchant_aliases`): patrón → comercio canónico
   (`amzn|amazon` → `amazon`). Se siembra con los ~500 comercios más comunes
   y crece con cada corrección del usuario ("esto es lo mismo que…").
3. **`merchant_entity_id` de Plaid** cuando exista: es la identidad más
   fuerte y le gana al texto.
4. **Coincidencia difusa** con `pg_trgm` (similitud ≥ 0.6) contra los
   comercios ya conocidos de la empresa, para errores de tipeo y variantes.

Resultado: `merchant_id` estable (`lp_private.merchants`). Todo lo demás
aprende por `merchant_id`, no por texto.

### B. Evidencias

Cada señal devuelve cuentas candidatas y un peso, siempre con una frase que
la explica.

| # | Señal | Qué mira | Tipo |
|---|---|---|---|
| 1 | **Regla** | Condiciones explícitas del usuario: comercio, rango de monto, cuenta bancaria, dirección | Decisiva |
| 2 | **Match** | Factura, pago o bill exacto y único (ya existe en v2) | Decisiva |
| 3 | **Transferencia** | Montos opuestos entre dos cuentas propias en ±3 días | Decisiva: no es ingreso ni gasto |
| 4 | **Memoria** | Veces que este comercio se confirmó en cada cuenta, con decaimiento (vida media ~180 días) | Fuerte |
| 5 | **Perfil de monto** | Si el comercio fue a varias cuentas, a cuál se parece este monto (vecino más cercano sobre log del monto) | Media |
| 6 | **Tokens** | Naive Bayes sobre las palabras de la descripción, entrenado con el historial confirmado de la empresa ("hotel", "fuel", "ads") | Media; cubre comercios nuevos |
| 7 | **Recurrencia** | Mismo comercio y monto ±5 % cada mes → suscripción; refuerza la memoria | Refuerzo |
| 8 | **Proveedor** | Cuenta por defecto del vendor (ya existe) | Media |
| 9 | **Red LedgiProof** | Qué **tipo** de cuenta usan otras empresas para este comercio, anónimo y agregado (≥ 5 empresas), mapeado al plan propio | Débil; resuelve el primer día |
| 10 | **Semillas + PFC de Plaid** | Lo que ya existe en v2, ponderado por la confianza que da Plaid | Débil |

### C. Combinación

- Cada señal suma **log-odds** a cada cuenta candidata (combinación tipo
  Naive Bayes); los pesos por señal empiezan fijos y se ajustan con los
  datos reales.
- Salida: probabilidad por cuenta, la mejor y el **margen** frente a la
  segunda.
- **Calibración por empresa** (`lp_private.brain_calibration`): por cada
  tramo de puntuación se guarda cuántas sugerencias se aceptaron y cuántas
  se corrigieron. La "confianza" que se muestra es la **precisión real
  medida** en esa empresa, no un número inventado.

### D. Decisión (compatible con semaphore_v2)

| Situación | Acción | Semáforo |
|---|---|---|
| Regla, match exacto o transferencia | Postea | Verde (sin verificar) |
| Prob ≥ 0.97, margen ≥ 0.5, comercio graduado **y** precisión medida de la empresa en ese tramo ≥ 98 % | Postea sola | Verde |
| Prob 0.75–0.97 | Sugerencia **preseleccionada**, un clic | Ámbar |
| Prob < 0.75 o dos cuentas empatadas | Pregunta sin preseleccionar | Ámbar |
| Señal de riesgo: duplicado, sobre el límite, monto > 3σ del habitual del comercio, comercio nuevo con monto alto | Nunca postea sola | Rojo |

El azul sigue siendo solo humano. Lo auto-posteado queda verde y entra a la
cola de verificación.

## 5. Explicabilidad: el diferenciador

Cada sugerencia guarda `evidence jsonb`:

```json
[
  {"signal": "memory",  "detail": "Confirmada 7 veces en «Software» (última: 12 sep)", "weight": 3.4},
  {"signal": "amount",  "detail": "USD 49 está en el rango habitual (45–55)",          "weight": 0.8},
  {"signal": "network", "detail": "El 82 % de empresas lo registra como software",      "weight": 0.5}
]
```

- La interfaz muestra **"¿Por qué?"** junto a cada sugerencia.
- Al postear, la evidencia se sella en `audit_events` (la cadena de hashes
  de la transacción). Un auditor puede ver qué sabía el sistema y por qué
  decidió así en ese momento. Ningún competidor ofrece esto, y encaja con la
  promesa de "prueba criptográfica" de LedgiProof.

## 6. Aprendizaje seguro

- **Solo aprende de personas**: confirmar en For review, verificar o
  corregir. Nunca de sus propios auto-posteos, porque eso crearía un bucle
  que se refuerza solo.
- **Una corrección pesa ×3** y le quita la graduación al comercio para las
  próximas N transacciones (deriva).
- Las firmas tienen **aislamiento por cliente** (ya existe en v2).
- La red usa solo conteos agregados de **tipo de cuenta** por comercio, con
  k-anonimato ≥ 5. Nunca expone cuentas, montos ni nombres de otra empresa.
  Hay que mencionarlo en los términos de uso y ofrecer que cada empresa
  pueda no participar.

## 7. Métricas (y marketing)

Por empresa y por mes:

- **Cobertura:** qué % se categoriza solo.
- **Precisión:** 1 − correcciones en 30 días.
- **Aceptación:** qué % de sugerencias se aceptan con un clic.
- **Tiempo ahorrado:** estimado.

Pantalla: *"El Brain categorizó 312 movimientos este mes con 99.1 % de
precisión y te ahorró ~6 horas"*. Objetivos: precisión en auto-posteo
≥ 98 %, cobertura del 60–70 % a los 3 meses de uso.

## 8. Implementación (todo en Postgres, sin servicios externos)

Tablas nuevas en `lp_private`:

- `merchants`
- `merchant_aliases`
- `merchant_account_stats` (org, cliente, comercio, cuenta: n, última vez, media y desviación del monto)
- `token_account_stats`
- `network_merchant_stats` (vista materializada con k-anonimato)
- `brain_calibration`

Extensión `pg_trgm`.

Funciones:

- `normalize_merchant(text, plaid_entity_id) → merchant_id`
- `brain_candidates(tx) → (account, weight, evidence)`, que reemplaza a
  `suggest_account`
- `brain_decide(tx) → post | suggest | ask | risk`
- `learn(tx, account, actor, was_correction)`, que extiende a
  `learn_merchant`

Cambio en `plaid-sync`: guardar `merchant_entity_id`, `counterparties`,
`personal_finance_category.detailed` y `confidence_level` en `metadata`.

Costo: unas pocas búsquedas indexadas por transacción. Los lotes van por
`auto_categorize_transactions`, como hoy.

## 9. Fases

| Fase | Contenido | Por qué primero |
|---|---|---|
| **F1** | Identidad del comercio (limpieza, alias, `pg_trgm`, datos de Plaid) + detección de transferencias + `evidence` y "¿Por qué?" | Mayor mejora de precisión con menor riesgo; la explicación se ve desde el día 1. |
| **F2** | Memoria con conteos y decaimiento + perfil de monto + combinación log-odds + calibración, reemplazando las confianzas fijas | Convierte la confianza en precisión medida y habilita la autopublicación segura. |
| **F3** | Tokens (Naive Bayes) + recurrencia | Cubre comercios que la empresa nunca vio. |
| **F4** | Red LedgiProof | Necesita volumen de empresas; resuelve el primer día. |
| **F5** | Métricas + señales de riesgo (anomalías) en rojo | Cierra el ciclo y da material de marketing. |

## 10. Riesgos

- **Sobre-automatizar y ensuciar los libros.** Mitigación: umbrales
  conservadores, compuerta por precisión medida por empresa, lo automático
  nunca es azul y "quitar categoría" lo devuelve a preguntar.
- **Privacidad de la red.** Mitigación: solo tipos de cuenta agregados,
  k-anonimato, opción de no participar.
- **Choque con `semaphore_v2` en curso.** Esta propuesta reemplaza piezas
  internas (`suggest_account`, `learn_merchant`), pero no el contrato
  (`derive_semaphore`, `risk_status`, azul humano). Conviene cerrar v2 y
  construir F1 encima.
