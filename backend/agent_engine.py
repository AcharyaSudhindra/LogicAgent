import os
import json
from typing import Generator, Dict, Any, List
from backend.sim_engine import simulate_verilog

try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

class RTLVerificationAgent:
    """
    An autonomous agent that reads, writes, simulates, and debugs Verilog code
    until it passes target testbench assertions.
    """
    def __init__(self, initial_code: str, checker: str, goal: str, api_key: str):
        self.current_code = initial_code
        self.checker = checker
        self.goal = goal
        self.api_key = api_key
        self.history: List[Dict[str, Any]] = []
        self.logs: List[str] = []
        self.last_sim_result: Dict[str, Any] = {}

    def read_verilog_code(self) -> str:
        """Read the current Verilog module implementation code."""
        return self.current_code

    def write_verilog_code(self, code: str) -> str:
        """Write and update the Verilog module implementation code."""
        self.current_code = code
        return "Source code updated successfully. Please run a simulation next to verify your changes."

    def run_simulation(self) -> str:
        """Compile the Verilog code, run testbench simulation, and retrieve assertion verifications and mismatches."""
        success, output, verify_results = simulate_verilog(self.current_code, self.checker)
        self.last_sim_result = {
            "success": success,
            "vcd": output if success else None,
            "verify_results": verify_results
        }
        
        if not success:
            return f"SIMULATION FAILURE (Compile/Syntax Error):\n{output}"
            
        verdict = verify_results.get("verdict", "Incorrect")
        errors = verify_results.get("errors", [])
        
        if verdict == "Correct":
            return "SIMULATION SUCCESS: All assertion checks passed! The Verilog code is correct."
            
        error_logs = []
        for i, err in enumerate(errors[:5]):
            error_logs.append(f"- {err.get('message')}")
        if len(errors) > 5:
            error_logs.append(f"- ...and {len(errors) - 5} more error(s)")
            
        return f"SIMULATION COMPLETED WITH MISMATCHES:\nVerdict: {verdict}\nTotal Errors: {len(errors)}\nError Details:\n" + "\n".join(error_logs)

    def execute_loop(self) -> Generator[str, None, None]:
        """
        Executes the agent tool-use loop and yields SSE-compatible JSON logs.
        """
        if not HAS_GENAI:
            yield json.dumps({"type": "error", "message": "google-genai library not installed."}) + "\n"
            return
            
        if not self.api_key:
            yield json.dumps({"type": "error", "message": "GEMINI_API_KEY environment variable is not set."}) + "\n"
            return

        try:
            client = genai.Client(api_key=self.api_key)
        except Exception as e:
            yield json.dumps({"type": "error", "message": f"Failed to initialize Gemini client: {str(e)}"}) + "\n"
            return

        # Core instructions mapping out the tools and goal
        system_instruction = (
            "You are an expert Autonomous RTL Verification Agent.\n"
            "Your objective is to correct the Verilog code under test so that it matches the user's requirements "
            "and passes all assertion checks successfully.\n\n"
            "Instructions:\n"
            "1. Read the current Verilog module code using `read_verilog_code`.\n"
            "2. Compile and run the simulator using `run_simulation` to analyze current waveforms and failures.\n"
            "3. If any mismatches or timing violations exist, carefully reason why they occurred.\n"
            "4. Correct the Verilog source code using `write_verilog_code` (ensure you preserve the module name and ports!).\n"
            "5. Re-run `run_simulation` to verify the fix.\n"
            "6. Iterate until the simulation returns success (all checks passed).\n\n"
            "Guidelines:\n"
            "- Explain your reasoning clearly before calling each tool.\n"
            "- Focus on fixing logic edge triggers, reset behavior, and logical variables."
        )

        prompt = (
            f"Verification Goal: {self.goal}\n"
            f"Target Checker Type: {self.checker}\n"
            "Begin execution loop. Inspect the initial Verilog file, compile, simulate, and fix any bugs found."
        )

        messages = [
            types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
        ]

        # Register functions as tool declarations
        # We wrap them in standard python definitions
        tools_list = [
            self.read_verilog_code,
            self.write_verilog_code,
            self.run_simulation
        ]

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=tools_list,
            temperature=0.2
        )

        yield json.dumps({"type": "start", "message": "Agent initialized. Starting verification loop..."}) + "\n"

        max_iterations = 6
        for iteration in range(max_iterations):
            yield json.dumps({
                "type": "log", 
                "step": iteration + 1, 
                "message": f"Iteration {iteration + 1}/{max_iterations}: Querying Gemini..."
            }) + "\n"

            try:
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=messages,
                    config=config
                )
            except Exception as e:
                yield json.dumps({"type": "error", "message": f"Gemini generation error: {str(e)}"}) + "\n"
                return

            candidate = response.candidates[0]
            # Store in content messages history
            messages.append(candidate.content)

            # Extract explanation/text and function calls
            thought = ""
            for part in candidate.content.parts:
                if part.text:
                    thought += part.text

            if thought.strip():
                yield json.dumps({
                    "type": "thought", 
                    "step": iteration + 1, 
                    "message": thought.strip()
                }) + "\n"

            # Check if model called tools
            function_calls = [p.function_call for p in candidate.content.parts if p.function_call]
            if not function_calls:
                yield json.dumps({
                    "type": "finish", 
                    "message": "Agent completed execution. Final source code reached.",
                    "code": self.current_code,
                    "sim_result": self.last_sim_result
                }) + "\n"
                return

            # Execute tool calls
            tool_responses = []
            for call in function_calls:
                name = call.name
                args = call.args
                
                yield json.dumps({
                    "type": "tool_call",
                    "step": iteration + 1,
                    "tool": name,
                    "args": args
                }) + "\n"

                result = ""
                try:
                    if name == "read_verilog_code":
                        result = self.read_verilog_code()
                    elif name == "write_verilog_code":
                        result = self.write_verilog_code(args.get("code", ""))
                        yield json.dumps({
                            "type": "code_change",
                            "code": self.current_code
                        }) + "\n"
                    elif name == "run_simulation":
                        result = self.run_simulation()
                    else:
                        result = f"Error: Unknown tool '{name}'."
                except Exception as ex:
                    result = f"Error executing tool '{name}': {str(ex)}"

                yield json.dumps({
                    "type": "tool_response",
                    "step": iteration + 1,
                    "tool": name,
                    "response": result
                }) + "\n"

                tool_responses.append(
                    types.Part.from_function_response(
                        name=name,
                        response={"result": result}
                    )
                )

            # Append tool feedback content to message history
            messages.append(
                types.Content(role="tool", parts=tool_responses)
            )

        yield json.dumps({
            "type": "finish", 
            "message": "Reached maximum reasoning steps.",
            "code": self.current_code,
            "sim_result": self.last_sim_result
        }) + "\n"
