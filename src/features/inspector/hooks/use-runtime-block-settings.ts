import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getBlockSettings,
  setBlockSettings,
  type RuntimeSettingsMode,
  type RuntimeSettingsObject,
} from '../../../lib/api/block-settings';

export function useRuntimeBlockSettings(
  sessionId: string | undefined,
  uniqueName: string | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const queryKey = ['runtime-block-settings', sessionId, uniqueName] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => getBlockSettings(sessionId as string, uniqueName as string),
    enabled: enabled && Boolean(sessionId) && Boolean(uniqueName),
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: ({ patch, mode = 'staged' }: { patch: RuntimeSettingsObject; mode?: RuntimeSettingsMode }) =>
      setBlockSettings(sessionId as string, uniqueName as string, patch, mode),
    onSuccess: (_, variables) => {
      queryClient.setQueryData<RuntimeSettingsObject | undefined>(queryKey, (current) => ({
        ...(current ?? {}),
        ...variables.patch,
      }));
    },
  });

  return {
    query,
    mutation,
  };
}
