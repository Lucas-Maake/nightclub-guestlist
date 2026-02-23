<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';

	type Props = {
		status: 'invited' | 'accepted' | 'declined' | 'checked-in';
	};

	let { status }: Props = $props();

	const labels: Record<Props['status'], string> = {
		invited: 'Invited',
		accepted: 'Accepted',
		declined: 'Declined',
		'checked-in': 'Checked In'
	};
</script>

{#if status === 'accepted'}
	<Badge variant="success">{labels[status]}</Badge>
{:else if status === 'declined'}
	<Badge variant="destructive">{labels[status]}</Badge>
{:else if status === 'checked-in'}
	<Badge variant="success">Checked In</Badge>
{:else}
	<Badge variant="outline">{labels[status]}</Badge>
{/if}
