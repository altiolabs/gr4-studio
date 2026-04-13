import { useQuery } from '@tanstack/react-query';
import { ApiClientError } from '../../../lib/api/client';
import { getBlocks } from '../../../lib/api/blocks';
import { config } from '../../../lib/config';

export const blockCatalogQueryKey = ['block-catalog'];

export function useBlockCatalogQuery() {
  const isLocalBackend = config.backendMode === 'local';
  return useQuery({
    queryKey: blockCatalogQueryKey,
    queryFn: getBlocks,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry(failureCount, error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'NETWORK') {
          return failureCount < (isLocalBackend ? 12 : 5);
        }
        if (error.code === 'HTTP' && [502, 503, 504].includes(error.status ?? 0)) {
          return failureCount < (isLocalBackend ? 8 : 4);
        }
      }

      return failureCount < 3;
    },
    retryDelay(attemptIndex) {
      return Math.min((isLocalBackend ? 500 : 750) * 2 ** attemptIndex, 5_000);
    },
  });
}
