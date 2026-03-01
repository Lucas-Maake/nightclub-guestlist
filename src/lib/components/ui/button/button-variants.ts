import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-sm font-medium transition-all duration-200 active:scale-[0.99] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_hsl(212_95%_58%/0.3)]',
				glow: 'bg-primary text-primary-foreground shadow-[0_0_20px_hsl(212_95%_58%/0.25)] hover:shadow-[0_0_30px_hsl(212_95%_58%/0.4)] hover:bg-primary/95',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/85',
				outline:
					'border border-primary/25 bg-primary/5 text-foreground backdrop-blur-sm hover:bg-primary/10 hover:border-primary/40',
				ghost: 'text-foreground hover:bg-accent/50',
				success:
					'bg-success text-success-foreground hover:bg-success/90 hover:shadow-[0_0_20px_hsl(150_80%_45%/0.3)]',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
			},
			size: {
				sm: 'h-9 px-4',
				md: 'h-11 px-5',
				lg: 'h-12 px-6 text-base',
				icon: 'h-10 w-10'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'md'
		}
	}
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
