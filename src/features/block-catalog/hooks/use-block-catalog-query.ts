import { useQuery } from '@tanstack/react-query';
import { getBlocks } from '../../../lib/api/blocks';

export const blockCatalogQueryKey = ['block-catalog'];

export function useBlockCatalogQuery() {
  return useQuery({
    queryKey: blockCatalogQueryKey,
    queryFn: getBlocks,
    staleTime: 30_000,
  });
}
