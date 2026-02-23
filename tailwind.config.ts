import type { Config } from 'tailwindcss';

const config: Config = {
	darkMode: ['class'],
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Satoshi', 'Avenir Next', 'Segoe UI', 'sans-serif']
			},
			colors: {
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				muted: 'hsl(var(--muted))',
				'muted-foreground': 'hsl(var(--muted-foreground))',
				card: 'hsl(var(--card))',
				'card-foreground': 'hsl(var(--card-foreground))',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				primary: 'hsl(var(--primary))',
				'primary-foreground': 'hsl(var(--primary-foreground))',
				secondary: 'hsl(var(--secondary))',
				'secondary-foreground': 'hsl(var(--secondary-foreground))',
				accent: 'hsl(var(--accent))',
				'accent-foreground': 'hsl(var(--accent-foreground))',
				success: 'hsl(var(--success))',
				'success-foreground': 'hsl(var(--success-foreground))',
				destructive: 'hsl(var(--destructive))',
				'destructive-foreground': 'hsl(var(--destructive-foreground))'
			},
			borderRadius: {
				lg: 'var(--radius-lg)',
				xl: 'var(--radius-xl)',
				'2xl': 'var(--radius-2xl)',
				'3xl': 'var(--radius-3xl)',
				pill: '9999px'
			},
			boxShadow: {
				surface: 'var(--shadow-surface)',
				lift: 'var(--shadow-lift)'
			}
		}
	}
};

export default config;
