# La IA del programa, con un modelo en tu propio ordenador

Un sitio del programa pide un modelo de lenguaje: **la ayuda con IA**, el
«¿cómo se hace?» del TPV y de cada pantalla.

Hubo un segundo, **«Identificar con IA»** en el editor de plantillas, que
adivinaba qué dato iba en cada recuadro de una factura de muestra. Se ha
quitado: en una plantilla un campo mal asignado imprime el NIF de un
cliente donde va el total, y eso no se arregla acertando la mayoría de
las veces. Las reglas de detección, que no adivinan, siguen ahí.

Antes llamaba a Gemini con la dirección y el modelo escritos a
fuego en el código. Ahora los dos pasan por `src/lib/ia/cliente.ts`, que
habla el dialecto de OpenAI (`/chat/completions`) — el que entienden
llama.cpp, LM Studio, vLLM, Ollama y casi cualquier servicio de pago.
Cambiar de modelo son dos variables de entorno.

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

## En esta máquina manda el modelo local

`.env.local` tiene puestas `IA_BASE_URL` e `IA_MODELO`, así que en
desarrollo contesta el Qwen de aquí y no Gemini. Arranca el servidor con
`arrancar.ps1` antes de usar la ayuda o la Asistencia IA; si no está en
pie, el programa dice que no ha podido contactar, no se cae.

**Ojo con el cupo de Gemini.** La clave que hay guardada es de capa
gratuita: 20 peticiones. Por eso en producción la ayuda con IA se agota
enseguida —y por eso los fallos que se veían eran 429 y tiempos
agotados, no averías—. Para que funcione de verdad para los clientes hay
que activar facturación en Google AI Studio o poner un Qwen alojado.

## Las variables

```bash
IA_BASE_URL=http://127.0.0.1:8080/v1
IA_MODELO=qwen3-4b-instruct
IA_API_KEY=           # vacía: un servidor local no pide autenticación
```

El orden en que se decide:

1. Si hay `IA_BASE_URL` **o** `IA_MODELO`, se usa ese servidor.
2. Si no, y hay `GEMINI_API_KEY`, se usa Gemini como siempre.
3. Si no hay nada, la ayuda contesta que no está configurada — que es
   mejor que inventarse respuestas.

## El aviso importante: esto NO arregla la web publicada

Un modelo local sirve a quien pueda abrir `127.0.0.1`. El servidor de
Vercel no puede llegar a un modelo que corre en una casa.

El mensaje **«La ayuda con IA no está configurada en este servidor»** que
se ve en `facturacion-app-mocha.vercel.app` viene de ahí: `.env.local`
tiene una clave de Gemini válida (comprobado), pero esa variable no está
puesta en Vercel. Para que la ayuda funcione también para los clientes hay
que hacer una de estas dos cosas:

- **Copiar `GEMINI_API_KEY` al panel de Vercel** (Settings → Environment
  Variables). Es lo inmediato y es lo decidido **de mientras**: cuesta lo
  que consuma y no hay nada que mantener.
- **Apuntar `IA_BASE_URL` a un Qwen accesible desde internet.** Es a
  donde se quiere llegar: un servicio con API compatible con OpenAI, o un
  `llama-server` propio en una máquina con GPU. Sale más barato con
  volumen, pero hay que mantenerlo y protegerlo con clave. Cuando lo
  haya, se ponen las tres variables en Vercel y Gemini deja de usarse
  solo, sin tocar código.

Lo que NO sirve es un túnel desde este portátil: la web se cae en cuanto
se apague el ordenador o cambie la red.

Mientras no se haga ninguna, en producción la ayuda con IA seguirá
diciendo que no está configurada — con razón.
