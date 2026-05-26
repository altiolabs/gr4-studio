import { useQuery } from '@tanstack/react-query';
import { getBlockDetails } from '../../../lib/api/block-details';
import { getVirtualRoutingBlockDetails } from '../../graph-editor/model/virtual-routing';

export function useBlockDetailsQuery(blockTypeId?: string) {
  return useQuery({
    queryKey: ['block-details', blockTypeId],
    queryFn: () => {
      const virtualDetails = getVirtualRoutingBlockDetails(blockTypeId as string);
      return virtualDetails ? Promise.resolve(virtualDetails) : getBlockDetails(blockTypeId as string);
    },
    enabled: Boolean(blockTypeId),
    staleTime: 60_000,
  });
}
