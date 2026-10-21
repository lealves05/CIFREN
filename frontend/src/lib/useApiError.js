import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { errorMessage, isAiNotConfigured } from './api';
import { P } from './permissions';

/**
 * Tratamento padrão de erro em ações (botões):
 *  - AI_NOT_CONFIGURED → aviso e, se a pessoa pode configurar, leva a Configurações › IA
 *  - demais (APPROVAL_REQUIRED, DUPLICATE, …) → aviso com a mensagem da API
 * MFA_SETUP_REQUIRED é tratado de forma global no Layout.
 */
export function useApiError() {
  const { toast } = useUI();
  const { can } = useAuth();
  const navigate = useNavigate();
  return useCallback((err) => {
    if (isAiNotConfigured(err)) {
      if (can(P.aiConfig)) {
        toast('A IA ainda não está configurada. Abrimos a tela para você colocar a chave.', 'error');
        navigate('/configuracoes/ia');
      } else {
        toast(errorMessage(err), 'error');
      }
      return;
    }
    toast(errorMessage(err), 'error');
  }, [can, navigate, toast]);
}
