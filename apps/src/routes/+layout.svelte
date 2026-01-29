<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import "../app.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Piano App</title>
</svelte:head>

<div class="h-full w-full flex flex-col items-center justify-center">
	{@render children()}
</div>
