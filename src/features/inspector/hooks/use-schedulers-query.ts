import { useQuery } from '@tanstack/react-query';
import { getSchedulers } from '../../../lib/api/schedulers';

export function useSchedulersQuery(enabled = true) {
  return useQuery({
    queryKey: ['schedulers'],
    queryFn: () => getSchedulers(),
    enabled,
    staleTime: 60_000,
  });
}
