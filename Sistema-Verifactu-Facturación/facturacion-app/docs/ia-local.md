# La IA del programa, con un modelo en tu propio ordenador

Dos sitios del programa piden un modelo de lenguaje:

- **La ayuda con IA** — el «¿cómo se hace?» del TPV y de cada pantalla.
- **El reconocimiento de plantillas** — cuando subes una factura de
  muestra, adivinar qué dato va en cada recuadro.

Antes los dos llamaban a Gemini con la dirección y el modelo escritos a
fuego en el código. **Gemini se ha retirado**: el modelo es Qwen. Los dos
pasan ahora por `src/lib/ia/cliente.ts`, que habla el dialecto de OpenAI
(`/chat/completions`) — el que entienden llama.cpp, LM Studio, vLLM,
Ollama y casi cualquier servicio alojado. Cambiar de servidor son dos
variables de entorno, sin tocar código.

## Lo que hay montado en esta máquina

| | |
|---|---|
| Modelo | Qwen 3 4B Instruct (2507), cuantizado Q4\_K\_M |
| Tamaño | 2,4 GB |
| Motor | `llama-server` de llama.cpp, compilación Vulkan (30 MB) |
| Dónde | `C:\Users\volit\ia-local\` |
| Dirección | `http://127.0.0.1:8080/v1` |

**Para arrancarlo:** doble clic en `C:\Users\volit\ia-local\arrancar.ps1`,
o desde una terminal:

```bash
powershell -ExecutionPolicy Bypass -File C:\Users\volit\ia-local\arrancar.ps1
```

Deja la ventana abierta. Mientras lo esté, la ayuda con IA funciona sin
pagar nada y sin que ninguna pregunta salga del ordenador. Al cerrarla, el
programa sigue funcionando igual: sólo la ayuda con IA deja de responder,
y lo dice.

No se ha puesto en el arranque de Windows a propósito: ocupa la gráfica y
unos 2,5 GB de memoria mientras corre, y eso es una decisión tuya, no mía.
Si lo quieres siempre disponible, un acceso directo al script en la
carpeta `shell:startup` basta.

### Por qué este modelo y no otro

Todo lo que se le pide son respuestas de tres frases y clasificaciones de
etiquetas. Para eso, un 4B actual va sobrado, cabe entero en los 4 GB de
la RTX 3050 y contesta en un par de segundos.

La variante **Instruct** importa. El Qwen 3 original razona en voz alta
antes de contestar, y aquí ese discurso interno sólo es latencia y
respuestas cortadas a media frase porque el cupo se gastó pensando. Aun
así, `limpiarRespuesta()` recorta los bloques `<think>` por si algún día
se cambia a un modelo que los emita.

## Las variables

```bash
IA_BASE_URL=http://127.0.0.1:8080/v1
IA_MODELO=qwen3-4b-instruct
IA_API_KEY=           # vacía: un servidor local no pide autenticación
```

Para un Qwen alojado serían las mismas tres, con la dirección y la clave
del servicio y el nombre del modelo que use ese servicio.

El orden en que se decide:

1. Si hay `IA_BASE_URL` **o** `IA_MODELO`, se usa ese servidor.
2. Si no hay nada, la ayuda contesta que no está configurada — que es
   mejor que inventarse respuestas.

**No hay proveedor de reserva.** Una clave de Gemini olvidada en el
entorno ya no enciende nada, y hay un test que lo comprueba: volver a
otro proveedor por descuido sería justo lo contrario de lo que se pidió.

## El aviso importante: esto NO arregla la web publicada

Un modelo local sirve a quien pueda abrir `127.0.0.1`. El servidor de
Vercel no puede llegar a un modelo que corre en una casa.

De ahí viene el mensaje **«La ayuda con IA no está configurada en este
servidor»** que se ve en `facturacion-app-mocha.vercel.app`.

Para que la ayuda funcione también para los clientes hace falta un Qwen
al que Vercel pueda llegar. Dos caminos:

- **Un servicio que sirva Qwen con API compatible con OpenAI.** Se da de
  alta una cuenta, se copia la clave y se ponen en Vercel las tres
  variables (`IA_BASE_URL`, `IA_MODELO`, `IA_API_KEY`). Sin tocar código:
  el cliente ya habla ese dialecto. Es lo que menos mantenimiento tiene.
- **Un servidor propio con el mismo `llama-server`** en una máquina con
  GPU accesible desde internet. Más barato con volumen, pero hay que
  mantenerlo, protegerlo con una clave y vigilar que esté en pie.

Lo que NO sirve es un túnel desde este portátil: la web se cae en cuanto
se apague el ordenador o cambie la red.

Mientras no haya ninguno de los dos, en producción la ayuda con IA
seguirá diciendo que no está configurada — con razón. En local funciona
con el modelo de aquí.
