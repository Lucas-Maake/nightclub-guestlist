<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let className = '';
	export { className as class };
</script>

<svg
	viewBox="0 0 26 24"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	class={cn('h-5 w-5', className)}
	aria-hidden="true"
>
	<path d="M2.5 22L10.3 2L13.2 8.3L8.6 22H2.5Z" fill="hsl(var(--foreground))" />
	<path d="M15.8 8.3L18.7 2L26.5 22H20.4L15.8 8.3Z" fill="hsl(var(--foreground))" />
	<path d="M9.7 22L13 13.5L16.3 22H9.7Z" fill="hsl(var(--primary))" />
</svg>
