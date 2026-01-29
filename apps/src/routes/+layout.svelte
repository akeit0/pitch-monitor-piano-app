<script lang="ts">
	import pianoIcon from "$lib/assets/piano.svg";
	import "../app.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={pianoIcon} />
	<title>Piano App</title>
</svelte:head>

<div
	class="h-full w-full flex flex-col items-center justify-center force-landscape"
>
	{@render children()}
</div>

<style>
	@media (orientation: landscape) and (max-height: 500px),
		(max-width: 768px) and (orientation: portrait) {
		.force-landscape {
			height: 100%;
			width: 100%;
		}
	}
</style>
