import React from "react";
import { useTranslation } from "react-i18next";
import { IoClose, IoChevronDown, IoChevronForward } from "react-icons/io5";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { ModalButton } from "#/components/shared/buttons/modal-button";
import { I18nKey } from "#/i18n/declaration";
import { PluginSpec } from "#/api/conversation-service/v1-conversation-service.types";
import { cn } from "#/utils/utils";

interface PluginLaunchModalProps {
  plugins: PluginSpec[];
  message?: string;
  isLoading?: boolean;
  onStartConversation: (plugins: PluginSpec[]) => void;
  onClose: () => void;
}

interface ExpandedState {
  [key: number]: boolean;
}

export function PluginLaunchModal({
  plugins,
  message,
  isLoading = false,
  onStartConversation,
  onClose,
}: PluginLaunchModalProps) {
  const { t } = useTranslation();
  const [pluginConfigs, setPluginConfigs] =
    React.useState<PluginSpec[]>(plugins);
  const [expandedSections, setExpandedSections] = React.useState<ExpandedState>(
    () => {
      // Initially expand plugins that have parameters
      const initial: ExpandedState = {};
      plugins.forEach((plugin, index) => {
        if (plugin.parameters && Object.keys(plugin.parameters).length > 0) {
          initial[index] = true;
        }
      });
      return initial;
    },
  );

  const pluginsWithParams = pluginConfigs.filter(
    (p) => p.parameters && Object.keys(p.parameters).length > 0,
  );
  const pluginsWithoutParams = pluginConfigs.filter(
    (p) => !p.parameters || Object.keys(p.parameters).length === 0,
  );

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const updateParameter = (
    pluginIndex: number,
    paramKey: string,
    value: unknown,
  ) => {
    setPluginConfigs((prev) => {
      const updated = [...prev];
      const plugin = { ...updated[pluginIndex] };
      plugin.parameters = {
        ...plugin.parameters,
        [paramKey]: value,
      };
      updated[pluginIndex] = plugin;
      return updated;
    });
  };

  const getPluginDisplayName = (plugin: PluginSpec): string => {
    const { source } = plugin;
    if (source.startsWith("github:")) {
      return source.replace("github:", "");
    }
    if (source.includes("/")) {
      const parts = source.split("/");
      return parts[parts.length - 1].replace(".git", "");
    }
    return source;
  };

  const handleStartConversation = () => {
    onStartConversation(pluginConfigs);
  };

  const renderParameterInput = (
    pluginIndex: number,
    paramKey: string,
    paramValue: unknown,
  ) => {
    const inputId = `plugin-${pluginIndex}-param-${paramKey}`;

    if (typeof paramValue === "boolean") {
      return (
        <div key={paramKey} className="flex items-center gap-3 py-2">
          <input
            id={inputId}
            data-testid={inputId}
            type="checkbox"
            checked={paramValue}
            onChange={(e) =>
              updateParameter(pluginIndex, paramKey, e.target.checked)
            }
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
          />
          <label htmlFor={inputId} className="text-sm text-neutral-300">
            {paramKey}
          </label>
        </div>
      );
    }

    if (typeof paramValue === "number") {
      return (
        <div key={paramKey} className="flex flex-col gap-1 py-2">
          <label htmlFor={inputId} className="text-sm text-neutral-400">
            {paramKey}
          </label>
          <input
            id={inputId}
            data-testid={inputId}
            type="number"
            value={paramValue}
            onChange={(e) =>
              updateParameter(
                pluginIndex,
                paramKey,
                parseFloat(e.target.value) || 0,
              )
            }
            className="rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      );
    }

    // Default: string input
    return (
      <div key={paramKey} className="flex flex-col gap-1 py-2">
        <label htmlFor={inputId} className="text-sm text-neutral-400">
          {paramKey}
        </label>
        <input
          id={inputId}
          data-testid={inputId}
          type="text"
          value={String(paramValue ?? "")}
          onChange={(e) =>
            updateParameter(pluginIndex, paramKey, e.target.value)
          }
          className="rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    );
  };

  const renderPluginSection = (plugin: PluginSpec, originalIndex: number) => {
    const isExpanded = expandedSections[originalIndex];
    const hasParams =
      plugin.parameters && Object.keys(plugin.parameters).length > 0;

    if (!hasParams) {
      return null;
    }

    return (
      <div
        key={`plugin-${originalIndex}`}
        className="rounded-lg border border-neutral-700 bg-neutral-800"
      >
        <button
          type="button"
          onClick={() => toggleSection(originalIndex)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-750"
          data-testid={`plugin-section-${originalIndex}`}
        >
          <span className="font-medium text-neutral-200">
            {getPluginDisplayName(plugin)}
          </span>
          {isExpanded ? (
            <IoChevronDown className="h-5 w-5 text-neutral-400" />
          ) : (
            <IoChevronForward className="h-5 w-5 text-neutral-400" />
          )}
        </button>

        {isExpanded && (
          <div className="border-t border-neutral-700 px-4 py-3">
            {plugin.ref && (
              <div className="mb-2 text-xs text-neutral-500">
                {t(I18nKey.LAUNCH$PLUGIN_REF)} {plugin.ref}
              </div>
            )}
            {plugin.repo_path && (
              <div className="mb-2 text-xs text-neutral-500">
                {t(I18nKey.LAUNCH$PLUGIN_PATH)} {plugin.repo_path}
              </div>
            )}
            <div className="space-y-1">
              {Object.entries(plugin.parameters || {}).map(([key, value]) =>
                renderParameterInput(originalIndex, key, value),
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const modalTitle =
    pluginConfigs.length === 1
      ? getPluginDisplayName(pluginConfigs[0])
      : t(I18nKey.LAUNCH$MODAL_TITLE_GENERIC);

  return (
    <ModalBackdrop onClose={onClose}>
      <ModalBody
        testID="plugin-launch-modal"
        className="max-h-[80vh] overflow-hidden flex flex-col"
        width="medium"
      >
        <div className="flex w-full items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-100">
            {t(I18nKey.LAUNCH$MODAL_TITLE)} {modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            aria-label="Close"
            data-testid="close-button"
          >
            <IoClose className="h-6 w-6" />
          </button>
        </div>

        {message && (
          <p className="w-full text-sm text-neutral-400">{message}</p>
        )}

        <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
          {pluginsWithParams.length > 0 && (
            <div className="space-y-3">
              {pluginConfigs.map((plugin, index) =>
                renderPluginSection(plugin, index),
              )}
            </div>
          )}

          {pluginsWithoutParams.length > 0 && (
            <div className={cn(pluginsWithParams.length > 0 && "mt-4")}>
              <h3 className="mb-2 text-sm font-medium text-neutral-400">
                {pluginsWithParams.length > 0
                  ? t(I18nKey.LAUNCH$ADDITIONAL_PLUGINS)
                  : t(I18nKey.LAUNCH$PLUGINS)}
              </h3>
              <div className="space-y-2">
                {pluginsWithoutParams.map((plugin, index) => (
                  <div
                    key={`simple-plugin-${index}`}
                    className="rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-300"
                  >
                    {getPluginDisplayName(plugin)}
                    {plugin.ref && (
                      <span className="ml-2 text-xs text-neutral-500">
                        @ {plugin.ref}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex w-full justify-end gap-3 pt-4 border-t border-neutral-700">
          <ModalButton
            testId="start-conversation-button"
            text={
              isLoading
                ? t(I18nKey.LAUNCH$STARTING)
                : t(I18nKey.LAUNCH$START_CONVERSATION)
            }
            onClick={handleStartConversation}
            disabled={isLoading}
            className={cn(
              "bg-blue-600 text-white hover:bg-blue-700 px-6",
              isLoading && "opacity-50 cursor-not-allowed",
            )}
          />
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
