import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent } from "@/types/api";
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
Ta aplikacja integruje pulpitową piaskownicę E2B z Qwen AI, tworząc agenta AI, który może wykonywać zadania  
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

Masz dostęp do narzędzia computer_use, które pozwala ci:  
- take_screenshot: Przechwycić aktualny ekran  
- click: Kliknąć w określone współrzędne  
- type: Wpisać tekst  
- key: Nacisnąć klawisze (jak Enter, Tab, itp.)  
- scroll: Przewijać w określonych kierunkach  
- move: Przesunąć kursor myszy  

KRYTYCZNIE WAŻNE - PROAKTYWNA KOMUNIKACJA:  
- ZAWSZE najpierw wyślij wiadomość tekstową opisującą DOKŁADNIE co zamierzasz zrobić, zanim wykonasz jakiekolwiek akcje  
- Podziel złożone zadania na kroki i przed każdym krokiem powiedz użytkownikowi co planujesz  
- Wykonuj wiele akcji w jednym zadaniu bez przerywania - kontynuuj aż do pełnego wykonania zadania  
- Po każdej akcji krótko podsumuj co zostało zrobione i co będzie dalej  
- Twoje działania mają być w pełni transparentne - użytkownik MUSI wiedzieć co robisz zanim to zrobisz  
- Nie pytaj o pozwolenie, po prostu informuj co będziesz robić i rób to  

PRZYKŁAD DOBREGO ZACHOWANIA:
1. "Zaraz otwieram Firefox, żeby wyszukać informacje o..."  
2. [wykonaj akcję otwarcia Firefox]  
3. "Teraz klikam w pasek adresu i wpisuję adres..."  
4. [wykonaj akcje]  
5. "Widzę wyniki, teraz klikam w pierwszy link..."  

Zawsze najpierw przeanalizuj zrzut ekranu, powiedz użytkownikowi co widzisz i co zamierzasz zrobić, a następnie wykonaj wszystkie potrzebne akcje.  
`;

export class QwenComputerStreamer
  implements ComputerInteractionStreamerFacade
{
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;

  private openai: OpenAI;

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    
    // Initialize OpenAI client with DashScope configuration
    this.openai = new OpenAI({
      apiKey: process.env.DASHCOPE_API_KEY,
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    });
    
    this.instructions = INSTRUKCJE;
  }

  async executeAction(
    action: any
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    switch (action.action) {
      case "take_screenshot": {
        const screenshot = await desktop.screenshot();
        const screenshotBase64 = Buffer.from(screenshot).toString('base64');
        return {
          action: "screenshot",
          data: {
            type: "computer_screenshot",
            image_url: `data:image/png;base64,${screenshotBase64}`,
          },
        };
      }

      case "click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);

        await desktop.leftClick(x, y);
        break;
      }

      case "type": {
        await desktop.write(action.text);
        break;
      }

      case "key": {
        await desktop.press(action.key);
        break;
      }

      case "scroll": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);

        await desktop.moveMouse(x, y);
        await desktop.scroll(action.direction === "up" ? "up" : "down", action.clicks || 3);
        break;
      }

      case "move": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);

        await desktop.moveMouse(x, y);
        break;
      }

      case "double_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);

        await desktop.doubleClick(x, y);
        break;
      }

      case "right_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);

        await desktop.rightClick(x, y);
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
  ): AsyncGenerator<SSEEvent<"qwen">> {
    const { messages, signal } = props;

    try {
      const modelResolution = this.resolutionScaler.getScaledResolution();

      // Convert messages to OpenAI format
      const openAIMessages = messages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      // Add initial screenshot
      const screenshot = await this.desktop.screenshot();
      const screenshotBase64 = Buffer.from(screenshot).toString('base64');
      
      // Add screenshot to the first user message if it exists
      if (openAIMessages.length > 0 && openAIMessages[openAIMessages.length - 1].role === "user") {
        const lastMessage = openAIMessages[openAIMessages.length - 1];
        // Replace the last message with vision content
        openAIMessages[openAIMessages.length - 1] = {
          role: "user",
          content: `${lastMessage.content}\n\nCurrent screen: [Screenshot attached]`
        };
      }

      // Create properly typed messages array for OpenAI
      const allMessages: any[] = [
        { role: "system", content: this.instructions },
        ...openAIMessages,
        {
          role: "user",
          content: [
            { type: "text", text: "Here is the current screen. Please analyze it and help the user with their task." },
            { 
              type: "image_url", 
              image_url: { 
                url: `data:image/png;base64,${screenshotBase64}` 
              } 
            }
          ]
        }
      ];

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "computer_use",
            description: "Use the computer to perform actions like clicking, typing, taking screenshots, etc.",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["take_screenshot", "click", "type", "key", "scroll", "move", "double_click", "right_click", "drag"],
                  description: "The action to perform"
                },
                coordinate: {
                  type: "array",
                  items: { type: "number" },
                  description: "X,Y coordinates for actions that require positioning"
                },
                text: {
                  type: "string",
                  description: "Text to type"
                },
                key: {
                  type: "string", 
                  description: "Key to press (e.g. 'Enter', 'Tab', 'Escape')"
                },
                direction: {
                  type: "string",
                  enum: ["up", "down", "left", "right"],
                  description: "Direction to scroll"
                },
                clicks: {
                  type: "number",
                  description: "Number of scroll clicks"
                },
                path: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" }
                    }
                  },
                  description: "Path for drag operations with start and end points"
                }
              },
              required: ["action"]
            }
          }
        }
      ];

      while (true) {
        if (signal.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        const response = await this.openai.chat.completions.create({
          model: "qwen3-vl-235b-a22b-instruct",
          messages: allMessages,
          tools: tools,
          tool_choice: "auto",
          stream: true,
          top_p: 0.8,
          temperature: 0.7,
          max_tokens: 4096
        });

        let fullContent = "";
        let toolCalls: any[] = [];
        let currentToolCall: any = null;
        
        for await (const chunk of response) {
          if (signal.aborted) {
            yield {
              type: SSEEventType.DONE,
              content: "Generation stopped by user",
            };
            return;
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          // Handle content streaming
          if (choice.delta?.content) {
            fullContent += choice.delta.content;
            yield {
              type: SSEEventType.UPDATE,
              content: choice.delta.content,
            };
          }

          // Handle tool calls
          if (choice.delta?.tool_calls) {
            for (const toolCallDelta of choice.delta.tool_calls) {
              if (toolCallDelta.index !== undefined) {
                if (!toolCalls[toolCallDelta.index]) {
                  toolCalls[toolCallDelta.index] = {
                    id: toolCallDelta.id || "",
                    type: "function",
                    function: { name: "", arguments: "" }
                  };
                }
                
                const toolCall = toolCalls[toolCallDelta.index];
                
                if (toolCallDelta.id) {
                  toolCall.id = toolCallDelta.id;
                }
                
                if (toolCallDelta.function?.name) {
                  toolCall.function.name = toolCallDelta.function.name;
                }
                
                if (toolCallDelta.function?.arguments) {
                  toolCall.function.arguments += toolCallDelta.function.arguments;
                }
              }
            }
          }

          if (choice.finish_reason === "tool_calls" && toolCalls.length > 0) {
            // Process ALL tool calls in sequence before taking screenshot
            const processedToolCalls: any[] = [];
            const toolResults: any[] = [];
            
            for (const toolCall of toolCalls) {
              if (toolCall.function.name === "computer_use") {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  
                  yield {
                    type: SSEEventType.ACTION,
                    action: args,
                  };

                  const actionResult = await this.executeAction(args);
                  
                  yield {
                    type: SSEEventType.ACTION_COMPLETED,
                  };

                  processedToolCalls.push(toolCall);
                  
                  let resultContent = `Action ${args.action} completed`;
                  if (actionResult && actionResult.data.type === "computer_screenshot") {
                    resultContent = "Screenshot taken";
                  }
                  
                  toolResults.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: resultContent
                  });

                } catch (error) {
                  logError("Error executing tool call:", error);
                  yield {
                    type: SSEEventType.ERROR,
                    content: `Error executing action: ${error}`,
                  };
                  
                  toolResults.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: `Error: ${error}`
                  });
                }
              }
            }
            
            // Add the assistant message with ALL tool calls
            (allMessages as any[]).push({
              role: "assistant",
              content: fullContent || "",
              tool_calls: processedToolCalls
            });
            
            // Add ALL tool results
            toolResults.forEach(result => {
              (allMessages as any[]).push(result);
            });

            // Take a new screenshot AFTER all actions are completed
            const newScreenshot = await this.desktop.screenshot();
            const newScreenshotBase64 = Buffer.from(newScreenshot).toString('base64');
            (allMessages as any[]).push({
              role: "user",
              content: [
                { type: "text", text: `All ${processedToolCalls.length} action(s) completed. Continue with the next steps. Here is the current screen:` },
                { 
                  type: "image_url", 
                  image_url: { 
                    url: `data:image/png;base64,${newScreenshotBase64}` 
                  } 
                }
              ]
            });
            
            // Continue the conversation
            toolCalls = [];
            fullContent = "";
            continue;
          }

          if (choice.finish_reason === "stop") {
            yield {
              type: SSEEventType.DONE,
              content: fullContent,
            };
            break;
          }
        }

        if (toolCalls.length === 0) {
          break;
        }
      }
    } catch (error) {
      logError("Error in Qwen streaming:", error);
      yield {
        type: SSEEventType.ERROR,
        content: `Streaming error: ${error}`,
      };
    }
  }
}