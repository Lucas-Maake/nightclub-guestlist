import { describe, it, expect } from 'vitest';
import { buttonVariants } from './button-variants';

describe('buttonVariants', () => {
	it('generates default variant classes', () => {
		const classes = buttonVariants({ variant: 'default', size: 'md' });
		expect(classes).toContain('bg-primary');
		expect(classes).toContain('text-primary-foreground');
	});

	it('generates glow variant classes', () => {
		const classes = buttonVariants({ variant: 'glow', size: 'md' });
		expect(classes).toContain('bg-primary');
		expect(classes).toContain('shadow');
	});

	it('generates outline variant classes', () => {
		const classes = buttonVariants({ variant: 'outline', size: 'md' });
		expect(classes).toContain('border');
		expect(classes).toContain('backdrop-blur');
	});

	it('generates ghost variant classes', () => {
		const classes = buttonVariants({ variant: 'ghost', size: 'md' });
		expect(classes).toContain('hover:bg-accent/50');
	});

	it('generates secondary variant classes', () => {
		const classes = buttonVariants({ variant: 'secondary', size: 'md' });
		expect(classes).toContain('bg-secondary');
	});

	it('generates destructive variant classes', () => {
		const classes = buttonVariants({ variant: 'destructive', size: 'md' });
		expect(classes).toContain('bg-destructive');
	});

	it('generates success variant classes', () => {
		const classes = buttonVariants({ variant: 'success', size: 'md' });
		expect(classes).toContain('bg-success');
	});

	it('generates small size classes', () => {
		const classes = buttonVariants({ variant: 'default', size: 'sm' });
		expect(classes).toContain('h-9');
		expect(classes).toContain('px-4');
	});

	it('generates medium size classes', () => {
		const classes = buttonVariants({ variant: 'default', size: 'md' });
		expect(classes).toContain('h-11');
		expect(classes).toContain('px-5');
	});

	it('generates large size classes', () => {
		const classes = buttonVariants({ variant: 'default', size: 'lg' });
		expect(classes).toContain('h-12');
		expect(classes).toContain('px-6');
		expect(classes).toContain('text-base');
	});

	it('generates icon size classes', () => {
		const classes = buttonVariants({ variant: 'default', size: 'icon' });
		expect(classes).toContain('h-10');
		expect(classes).toContain('w-10');
	});

	it('includes base classes in all variants', () => {
		const classes = buttonVariants({ variant: 'default', size: 'md' });
		expect(classes).toContain('inline-flex');
		expect(classes).toContain('items-center');
		expect(classes).toContain('rounded-pill');
	});

	it('uses default variant and size when not specified', () => {
		const classes = buttonVariants({});
		expect(classes).toContain('bg-primary'); // default variant
		expect(classes).toContain('h-11'); // md size
	});
});
