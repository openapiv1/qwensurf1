import { Sandbox } from "@e2b/desktop";
import Anthropic from "@anthropic-ai/sdk";
import { SSEEventType, SSEEvent, sleep } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import {
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";
import { ResolutionScaler } from "./resolution";
import { ComputerAction, ToolInput } from "@/types/anthropic";
import { logError } from "../logger";

const INSTRUKCJE = `
Jesteś Surfem, pomocnym asystentem, który potrafi korzystać z komputera, aby wspierać użytkownika w jego zadaniach.  
Możesz używać komputera do wyszukiwania w internecie, pisania kodu i wielu innych rzeczy.  

Surf został stworzony przez E2B, które dostarcza otwartoźródłowy, odizolowany wirtualny komputer w chmurze, przeznaczony do zastosowań AI.  
Ta aplikacja integruje pulpitową piaskownicę E2B z API Anthropic, tworząc agenta AI, który może wykonywać zadania  
na wirtualnym komputerze poprzez polecenia w języku naturalnym.  

Zrzuty ekranu, które otrzymujesz, pochodzą z działającej instancji piaskownicy, co pozwala ci widzieć i wchodzić w interakcję z prawdziwym  
środowiskiem wirtualnego komputera w czasie rzeczywistym.  

Ponieważ działasz w bezpiecznej, odizolowanej mikro-VM piaskownicy, możesz wykonywać większość poleceń i operacji bez obaw  
o kwestie bezpieczeństwa. To środowisko zostało zaprojektowane specjalnie do eksperymentów z AI i wykonywania zadań.  

WAŻNE UWAGI:  
1. Automatycznie otrzymujesz zrzut ekranu po każdej wykonanej akcji. NIE musisz osobno prosić o zrzuty ekranu.  
2. Gdy użytkownik prosi o wykonanie polecenia w terminalu, ZAWSZE naciśnij Enter natychmiast po wpisaniu komendy.  
3. Gdy użytkownik wyraźnie prosi o naciśnięcie jakiegokolwiek klawisza (Enter, Tab, Ctrl+C, itp.) w dowolnej aplikacji lub interfejsie,  
   MUSISZ to zrobić natychmiast.  
4. Pamiętaj: W środowiskach terminalowych polecenia NIE są wykonywane, dopóki nie zostanie naciśnięty Enter.  
5. Podczas pracy nad złożonymi zadaniami kontynuuj je do końca bez zatrzymywania się, aby prosić o potwierdzenie.  
   Podziel złożone zadania na kroki i wykonuj je w pełni.  

DODATKOWO:  
- Na bieżąco pisz komentarze i informuj użytkownika o tym, co aktualnie robisz, co planujesz zrobić i jakie są kolejne kroki.  
- Wysyłaj te komentarze jako osobne wiadomości, aby użytkownik był stale na bieżąco.  
- Często sprawdzaj stan sandboxa, wykonując regularne zrzuty ekranu.  
- Twoje działania mają być transparentne – użytkownik powinien zawsze wiedzieć, co się dzieje w piaskownicy.  

Pomóż użytkownikowi skutecznie, obserwując aktualny stan komputera i podejmując odpowiednie działania.  
`;

export class AnthropicComputerStreamer
  implements ComputerInteractionStreamerFacade
{
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;
  private anthropic: Anthropic;

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.instructions = INSTRUKCJE;
  }

  async executeAction(
    tool: BetaToolUseBlock & ToolInput
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    if (tool.name === "str_replace_editor") {
      const editorCommand = tool.input;

      switch (editorCommand.command) {
        default: {
        }
      }
      return;
    }

    if (tool.name === "bash") {
      const bashCommand = tool.input;

      switch (bashCommand.command) {
        case "command": {
          desktop.commands.run(bashCommand.command);
          return;
        }

        default: {
        }
      }

      return;
    }

    const action = tool.input;

    switch (action.action) {
      case "screenshot": {
        // that explicit screenshot actions are no longer necessary
        break;
      }

      case "double_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.doubleClick(x, y);
        break;
      }

      case "triple_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );

        await desktop.moveMouse(x, y);
        if (action.text) {
          await desktop.press(action.text);
        }
        await desktop.leftClick();
        await desktop.leftClick();
        await desktop.leftClick();
        break;
      }

      case "left_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );

        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.leftClick(x, y);
        break;
      }

      case "right_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );

        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.rightClick(x, y);
        break;
      }

      case "middle_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );

        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.middleClick(x, y);
        break;
      }

      case "type": {
        await desktop.write(action.text);
        break;
      }

      case "key": {
        await desktop.press(action.text);
        break;
      }

      case "hold_key": {
        await desktop.press(action.text);
        break;
      }

      case "mouse_move": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );

        await desktop.moveMouse(x, y);
        break;
      }

      case "left_mouse_down": {
        break;
      }

      case "left_mouse_up": {
        break;
      }

      case "left_click_drag": {
        const start = this.resolutionScaler.scaleToOriginalSpace(
          action.start_coordinate
        );
        const end = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );

        await desktop.drag(start, end);
        break;
      }

      case "scroll": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );

        const direction = action.scroll_direction;
        const amount = action.scroll_amount;

        await desktop.moveMouse(x, y);

        if (action.text) {
          await desktop.press(action.text);
        }

        await desktop.scroll(direction === "up" ? "up" : "down", amount);
        break;
      }

      case "wait": {
        await sleep(action.duration * 1000);
        break;
      }

      case "cursor_position": {
        break;
      }

      default: {
      }
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"anthropic">> {
    const { messages, signal } = props;

    const anthropicMessages: BetaMessageParam[] = messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: [{ type: "text", text: msg.content }],
    }));

    try {
      while (true) {
        if (signal?.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        const modelResolution = this.resolutionScaler.getScaledResolution();

        const response = await this.anthropic.beta.messages.create({
          model: "claude-3-7-sonnet-latest",
          max_tokens: 4096,
          messages: anthropicMessages,
          system: this.instructions,
          tools: [
            {
              type: "computer_20250124",
              name: "computer",
              display_width_px: modelResolution[0],
              display_height_px: modelResolution[1],
            },
            {
              type: "bash_20250124",
              name: "bash",
            },
          ],
          betas: ["computer-use-2025-01-24"],
          thinking: { type: "enabled", budget_tokens: 1024 },
        });

        const toolUseBlocks: BetaToolUseBlock[] = [];
        let reasoningText = "";

        for (const block of response.content) {
          if (block.type === "tool_use") {
            toolUseBlocks.push(block);
          } else if (block.type === "text") {
            reasoningText += block.text;
          } else if (block.type === "thinking" && block.thinking) {
            yield {
              type: SSEEventType.REASONING,
              content: block.thinking,
            };
          }
        }

        if (reasoningText) {
          yield {
            type: SSEEventType.REASONING,
            content: reasoningText,
          };
        }

        if (toolUseBlocks.length === 0) {
          yield {
            type: SSEEventType.DONE,
          };
          break;
        }

        const assistantMessage: BetaMessageParam = {
          role: "assistant",
          content: response.content,
        };
        anthropicMessages.push(assistantMessage);

        const toolResults: BetaToolResultBlockParam[] = [];

        for await (const toolUse of toolUseBlocks) {
          yield {
            type: SSEEventType.ACTION,
            action: toolUse.input as ComputerAction,
          };

          await this.executeAction(toolUse as BetaToolUseBlock & ToolInput);

          yield {
            type: SSEEventType.ACTION_COMPLETED,
          };

          // Always take a screenshot after each action
          const screenshotData = await this.resolutionScaler.takeScreenshot();
          const screenshotBase64 =
            Buffer.from(screenshotData).toString("base64");

          const toolResultContent: BetaToolResultBlockParam["content"] = [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: screenshotBase64,
              },
            },
          ];

          const toolResult: BetaToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResultContent,
            is_error: false,
          };

          toolResults.push(toolResult);
        }

        if (toolResults.length > 0) {
          const userMessage: BetaMessageParam = {
            role: "user",
            content: toolResults,
          };
          anthropicMessages.push(userMessage);
        }
      }
    } catch (error) {
      logError("ANTHROPIC_STREAMER", error);
      yield {
        type: SSEEventType.ERROR,
        content: "An error occurred with the AI service. Please try again.",
      };
    }
  }
}
