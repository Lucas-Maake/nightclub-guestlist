<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
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

	<main class="relative z-10 mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12">
		<div class="flex min-h-[calc(100vh-68px)] items-center justify-center py-20 lg:py-28">
			<div class="flex w-full max-w-[900px] flex-col items-center text-center">
				<div class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400"></span>
					<span class="text-[11px] uppercase tracking-[0.12em] text-violet-300" style="font-family: 'Space Mono', monospace;">
						Best Nightlife In America
					</span>
				</div>

				<div class="mt-8 flex items-center justify-center gap-4">
					<BrandMark class="h-10 w-10 shrink-0 sm:h-14 sm:w-14 lg:h-16 lg:w-16" />
					<h1 class="text-5xl font-extrabold uppercase leading-none tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl" style="font-family: 'Space Grotesk', sans-serif; text-shadow: 0 12px 34px rgba(0,0,0,0.5);">
						Apollo HQ
					</h1>
				</div>

				<p class="mt-5 max-w-[520px] text-lg font-medium text-zinc-300 sm:text-xl">
					Your night starts here.
				</p>
				<p class="mt-2 max-w-[480px] text-sm text-zinc-500">
					Curated events, reserved tables, and instant access — wherever the night takes you.
				</p>

				<div class="mt-9 flex flex-wrap items-center justify-center gap-3">
					<a
						href="/event"
						class="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 px-8 text-base font-bold text-white shadow-[0_0_32px_rgba(168,85,247,0.45)] transition duration-200 hover:scale-[1.03] hover:shadow-[0_0_52px_rgba(168,85,247,0.65)]"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						Explore Events
						<ArrowRight class="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
					</a>
					<a
						href="#how-it-works"
						class="inline-flex h-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/60 px-7 text-base font-semibold text-zinc-300 backdrop-blur transition duration-200 hover:border-zinc-500 hover:text-white"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						How it works
					</a>
				</div>
			</div>
		</div>
	</main>
</div>
