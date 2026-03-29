import { useQuery } from '@tanstack/react-query';
import { getBlockDetails } from '../../../lib/api/block-details';

export function useBlockDetailsQuery(blockTypeId?: string) {
  return useQuery({
    queryKey: ['block-details', blockTypeId],
    queryFn: () => getBlockDetails(blockTypeId as string),
    enabled: Boolean(blockTypeId),
    staleTime: 60_000,
  });
}
