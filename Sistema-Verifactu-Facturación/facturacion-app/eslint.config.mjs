import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /**
   * UN BOTÓN CON UN DIBUJO DENTRO Y NADA MÁS NO SE LLAMA DE NINGUNA MANERA
   *
   * Un lector de pantalla anuncia «botón» a secas, y quien navega con
   * teclado no sabe cuál es cuál. Había noventa y tres así repartidos por
   * la aplicación —la papelera de cada fila, el aspa de cada modal, las
   * flechas de las cantidades— porque nada lo impedía.
   *
   * Esto lo impide a partir de ahora. Los que ya estaban se van arreglando
   * por pantallas; la regla evita que la cuenta vuelva a subir, que es lo
   * que de verdad cambia el resultado a medio plazo.
   */
  {
    files: ['src/**/*.tsx'],
    rules: {
      'jsx-a11y/control-has-associated-label': ['error', {
        controlComponents: [],
        // `td` va en la lista porque una celda de DATOS vacía es legítima:
        // en una fila de totales, la columna que no suma nada se queda en
        // blanco a propósito. `th` NO va: una cabecera sí tiene que nombrar
        // su columna, aunque sea sólo para quien la oye.
        ignoreElements: ['audio', 'canvas', 'embed', 'input', 'textarea', 'td', 'tr', 'video'],
        ignoreRoles: ['grid', 'listbox', 'menu', 'menubar', 'radiogroup', 'row', 'tablist', 'toolbar', 'tree', 'treegrid'],
        depth: 5,
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
