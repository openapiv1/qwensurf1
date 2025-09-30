import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent } from "@/types/api";
import {
  ResponseComputerToolCall,
  ResponseInput,
  ResponseInputItem,
  Tool,
} from "openai/resources/responses/responses.mjs";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { ResolutionScaler } from "./resolution";

const INSTRUKCJE = `
Jesteś Surfem, pomocnym asystentem, który potrafi korzystać z komputera, aby wspierać użytkownika w jego zadaniach.  
Możesz używać komputera do wyszukiwania w internecie, pisania kodu i wielu innych rzeczy.  

Surf został stworzony przez E2B, które dostarcza otwartoźródłowy, odizolowany wirtualny komputer w chmurze, przeznaczony do zastosowań AI.  
Ta aplikacja integruje pulpitową piaskownicę E2B z API OpenAI, tworząc agenta AI, który może wykonywać zadania  
na wirtualnym komputerze poprzez polecenia w języku naturalnym.  

Zrzuty ekranu, które otrzymujesz, pochodzą z działającej instancji piaskownicy, co pozwala ci widzieć i wchodzić w interakcję z prawdziwym  
środowiskiem wirtualnego komputera w czasie rzeczywistym.  

Ponieważ działasz w bezpiecznej, odizolowanej mikro-VM piaskownicy, możesz wykonywać większość poleceń i operacji bez obaw  
o kwestie bezpieczeństwa. To środowisko zostało zaprojektowane specjalnie do eksperymentów z AI i wykonywania zadań.  

Piaskownica oparta jest na Ubuntu 22.04 i zawiera wiele preinstalowanych aplikacji, w tym:  
- przeglądarkę Firefox  
- Visual Studio Code  
- pakiet LibreOffice  
- Pythona 3 z popularnymi bibliotekami  
- terminal ze standardowymi narzędziami Linuksa  
- menedżer plików (PCManFM)  
- edytor tekstu (Gedit)  
- kalkulator i inne podstawowe narzędzia  

WAŻNE: Możesz uruchamiać polecenia w terminalu w dowolnym momencie bez pytania o potwierdzenie,  
o ile są one potrzebne do wykonania zadania, które użytkownik ci powierzył.  
Powinieneś wykonywać polecenia natychmiast, kiedy są potrzebne, aby sprawnie zrealizować prośbę użytkownika.  

WAŻNE: Wpisując polecenia w terminalu, ZAWSZE wysyłaj akcję KLIKNIJ ENTER natychmiast po wpisaniu komendy, aby ją uruchomić.  
Polecenia terminalowe nie zostaną wykonane, dopóki nie naciśniesz Enter.  

WAŻNE: Podczas edytowania plików preferuj użycie Visual Studio Code (VS Code), ponieważ zapewnia ono lepsze środowisko edycji  
z podświetlaniem składni, uzupełnianiem kodu i innymi przydatnymi funkcjami.  

DODATKOWO:  
- Na bieżąco pisz komentarze i informuj użytkownika o tym, co aktualnie robisz, co planujesz zrobić i jakie są kolejne kroki.  
- Wysyłaj te komentarze jako osobne wiadomości, aby użytkownik był stale na bieżąco.  
- Często sprawdzaj stan sandboxa, wykonując regularne zrzuty ekranu.  
- Twoje działania mają być transparentne – użytkownik powinien zawsze wiedzieć, co się dzieje w piaskownicy.  
`;

export class OpenAIComputerStreamer
  implements ComputerInteractionStreamerFacade
{
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;

  private openai: OpenAI;

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    this.openai = new OpenAI();
    this.instructions = INSTRUKCJE;
  }

  async executeAction(
    action: ResponseComputerToolCall["action"]
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    switch (action.type) {
      case "screenshot": {
        break;
      }
      case "double_click": {
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.x,
          action.y,
        ]);

        await desktop.doubleClick(coordinate[0], coordinate[1]);
        break;
      }
      case "click": {
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.x,
          action.y,
        ]);

        if (action.button === "left") {
          await desktop.leftClick(coordinate[0], coordinate[1]);
        } else if (action.button === "right") {
          await desktop.rightClick(coordinate[0], coordinate[1]);
        } else if (action.button === "wheel") {
          await desktop.middleClick(coordinate[0], coordinate[1]);
        }
        break;
      }
      case "type": {
        await desktop.write(action.text);
        break;
      }
      case "keypress": {
        await desktop.press(action.keys);
        break;
      }
      case "move": {
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.x,
          action.y,
        ]);

        await desktop.moveMouse(coordinate[0], coordinate[1]);
        break;
      }
      case "scroll": {
        if (action.scroll_y < 0) {
          await desktop.scroll("up", Math.abs(action.scroll_y));
        } else if (action.scroll_y > 0) {
          await desktop.scroll("down", action.scroll_y);
        }
        break;
      }
      case "wait": {
        break;
      }
      case "drag": {
        const startCoordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.path[0].x,
          action.path[0].y,
        ]);

        const endCoordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.path[1].x,
          action.path[1].y,
        ]);

        await desktop.drag(startCoordinate, endCoordinate);
        break;
      }
      default: {
        logWarning("Unknown action type:", action);
      }
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"openai">> {
    const { messages, signal } = props;

    try {
      const modelResolution = this.resolutionScaler.getScaledResolution();

      const computerTool: Tool = {
        // @ts-ignore
        type: "computer_use_preview",
        display_width: modelResolution[0],
        display_height: modelResolution[1],
        // @ts-ignore
        environment: "linux",
      };

      let response = await this.openai.responses.create({
        model: "computer-use-preview",
        tools: [computerTool],
        input: [...(messages as ResponseInput)],
        truncation: "auto",
        instructions: this.instructions,
        reasoning: {
          effort: "medium",
          generate_summary: "concise",
        },
      });

      while (true) {
        if (signal.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        const computerCalls = response.output.filter(
          (item) => item.type === "computer_call"
        );

        if (computerCalls.length === 0) {
          yield {
            type: SSEEventType.REASONING,
            content: response.output_text,
          };
          yield {
            type: SSEEventType.DONE,
          };
          break;
        }

        const computerCall = computerCalls[0];
        const callId = computerCall.call_id;
        const action = computerCall.action;

        const reasoningItems = response.output.filter(
          (item) => item.type === "message" && "content" in item
        );

        if (reasoningItems.length > 0 && "content" in reasoningItems[0]) {
          const content = reasoningItems[0].content;

          // Log to debug why content is not a string
          logDebug("Reasoning content structure:", content);

          yield {
            type: SSEEventType.REASONING,
            content:
              reasoningItems[0].content[0].type === "output_text"
                ? reasoningItems[0].content[0].text
                : JSON.stringify(reasoningItems[0].content),
          };
        }

        yield {
          type: SSEEventType.ACTION,
          action,
        };

        await this.executeAction(action);

        yield {
          type: SSEEventType.ACTION_COMPLETED,
        };

        const newScreenshotData = await this.resolutionScaler.takeScreenshot();
        const newScreenshotBase64 =
          Buffer.from(newScreenshotData).toString("base64");

        const computerCallOutput: ResponseInputItem = {
          call_id: callId,
          type: "computer_call_output",
          output: {
            // @ts-ignore
            type: "input_image",
            image_url: `data:image/png;base64,${newScreenshotBase64}`,
          },
        };

        response = await this.openai.responses.create({
          model: "computer-use-preview",
          previous_response_id: response.id,
          instructions: this.instructions,
          tools: [computerTool],
          input: [computerCallOutput],
          truncation: "auto",
          reasoning: {
            effort: "medium",
            generate_summary: "concise",
          },
        });
      }
    } catch (error) {
      logError("OPENAI_STREAMER", error);
      if (error instanceof OpenAI.APIError && error.status === 429) {
        // since hitting rate limits is not expected, we optimistically assume we hit our quota limit (both have the same status code)
        yield {
          type: SSEEventType.ERROR,
          content:
            "Our usage quota ran out for this month. Please visit GitHub, self host the repository and use your own API keys to continue.",
        };
        yield {
          type: SSEEventType.DONE,
        };
        return;
      }
      yield {
        type: SSEEventType.ERROR,
        content: "An error occurred with the AI service. Please try again.",
      };
    }
  }
}
