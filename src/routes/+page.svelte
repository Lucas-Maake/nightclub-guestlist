<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
</script>

<div class="relative min-h-screen overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<div class="pointer-events-none absolute inset-0 bg-[url('/images/landing-minimal-bg.png')] bg-cover bg-center opacity-70"></div>
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.22),transparent_36%),radial-gradient(circle_at_50%_72%,rgba(5,5,7,0.94),rgba(5,5,7,1)_74%),linear-gradient(180deg,rgba(5,5,7,0.2)_0%,rgba(5,5,7,0.82)_58%,#050507_100%)]"
	></div>
	<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,7,0.62)_0%,rgba(5,5,7,0.1)_50%,rgba(5,5,7,0.62)_100%)]"></div>

	<div class="relative z-20">
		<AppHeader />
	</div>

	<main class="relative z-10 mx-auto flex min-h-[calc(100vh-68px)] w-full max-w-[1440px] items-center justify-center px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
		<section class="flex w-full max-w-[980px] flex-col items-center text-center">
			<div class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2">
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400"></span>
				<span class="text-[11px] uppercase tracking-[0.12em] text-violet-300" style="font-family: 'Space Mono', monospace;">
					QUALITY NIGHTLIFE · ACROSS AMERICA
				</span>
			</div>

			<h1 class="mt-6 text-5xl font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white sm:text-6xl lg:text-8xl" style="font-family: 'Space Grotesk', sans-serif; text-shadow: 0 12px 34px rgba(0,0,0,0.5);">
				<span class="block">THE STANDARD</span>
				<span class="block">FOR NIGHTLIFE</span>
				<span class="block bg-gradient-to-r from-violet-300 via-violet-100 to-cyan-300 bg-clip-text text-transparent">IN EVERY CITY</span>
			</h1>

			<p class="mt-5 max-w-[560px] text-base text-zinc-400 sm:text-lg">
				Curated events, reserved tables, and instant access — wherever the night takes you.
			</p>

			<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
				<a
					href="/event"
					class="group inline-flex h-13 items-center justify-center gap-2.5 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 px-8 text-base font-bold text-white shadow-[0_0_32px_rgba(168,85,247,0.45)] transition duration-200 hover:shadow-[0_0_52px_rgba(168,85,247,0.65)] hover:scale-[1.03]"
					style="font-family: 'Space Grotesk', sans-serif;"
				>
					Explore Events
					<ArrowRight class="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
				</a>
			</div>
		</section>
	</main>
</div>
