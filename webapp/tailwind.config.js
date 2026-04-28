/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: "#0B0F1A",
        blue: "#3B82F6",
        cyan: "#22D3EE",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #3B82F6, #22D3EE)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(34, 211, 238, 0.4)",
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
    },
  },
};
