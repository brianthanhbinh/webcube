{************************************************************}
{                                                            }
{  Module uScript                                            }
{  Copyright (c) 2000 Alex Boiko                             }
{  2014-2020                                                 }
{                                                            }
{  Author: Boris Mouradov                                    }
{  Script engine                                             }
{************************************************************}

{Based on PASCALC v 3.00 source}
{const
_pascalc: AnsiString = #10#10 +
'*************************************************'#10 +
'*      PASCALC interpreter v3.00 for Delphi     *'#10 +
'*    (c)2000 Alex Boiko  alexboiko@mtu-net.ru   *'#10 +
'*            http://alexboiko.da.ru             *'#10 +
'*************************************************'#10#10;}


unit uScript;

{$mode Delphi}

interface

uses classes, Generics.Collections, Variants;

type
  TToken =
    (tEMPTY, tVR, tCON, tTRUE, tFALSE,
    tEQU, tOR, tAND, tNOT, tXOR,
    tCOMMA, tLBL, tNEQ, tGT, tLS,
    tGTE, tLSE, tADD, tSUB, tMUL,
    tDIVIDE, tDIV, tMOD, tPWR, tLBR, tRBR, tLARR,
    tRARR, tSEMI, tREM, tREMB, tREME,
    tASSIGN, tBEGIN, tEND, tIF, tTHEN,
    tELSE, tFOR, tTO, tDOWNTO, tDO,
    tWHILE, tREPEAT, tUNTIL, tBREAK, tCONTINUE,
    tEXIT, tGOTO, tSHL, tSHR, tPROC,
    tFUNCT, tUSES, tINCLUDE, tCASE, tOF,
    tDOT2);

type
  TTokenSet = set of TToken;

const
  ResWords: array[TToken] of String =
  ('', '', '', 'TRUE', 'FALSE',
    '=', 'OR', 'AND', 'NOT', 'XOR',
    ',', ':', '<>', '>', '<',
    '>=', '<=', '+', '-', '*',
    '/', 'DIV', 'MOD', '^', '(', ')', '[',
    ']', ';', '//', '{', '}',
    ':=', 'BEGIN', 'END', 'IF', 'THEN',
    'ELSE', 'FOR', 'TO', 'DOWNTO', 'DO',
    'WHILE', 'REPEAT', 'UNTIL', 'BREAK', 'CONTINUE',
    'EXIT', 'GOTO', 'SHL', 'SHR', 'PROCEDURE',
    'FUNCTION', 'USES', 'INCLUDE', 'CASE', 'OF',
    '..');

const
  {$IFDEF PAS2JS}
  Alpha: set of Char = ['_', '0'..'9', 'a'..'z', 'A'..'Z'];
  {$ELSE}
  Alpha: set of AnsiChar = ['_', '0'..'9', 'a'..'z', 'A'..'Z'];
  {$ENDIF}
  StrDelimiter: Char = '''';
  DecimalPoint: Char = '.';
  TokenDelimiter: Char = #127;

type
  TVar = record
    Name: String;
    Value: Variant;
  end;

type
  PIdleProc = procedure;

type
//  PFunction = function(Sender: TObject; Vars: TVarList; var Res: TVar): Boolean;
  TFunction = function(Vars: TList<TVar>; var Res: TVar): Boolean of Object;

type
  TFunc = record
    Name: String;
    Func: TFunction;
  end;

type
  TProcedure = record
    Name: String;
    Body: String;
    Params: String;
    Result: Boolean;
  end;

type
  TScript = class
    constructor Create;
    destructor Destroy; override;
    procedure ClearVars;
    procedure ClearProcs;
    procedure ClearFuncs;
    procedure DefineConsts;
    function VarCount: integer;
    function VarExists(const N: String): Boolean;
    procedure VarRemove(const N: String);
    function VarByName(const N: String; var V: TVar): Boolean;
    function SetVar(V: TVar): Boolean;
    function SetValue(N: String; V: variant): Boolean;
    function SetFunction(Name: String; F: TFunction): Boolean;
    procedure SetIdleProc(P: Pointer);
    procedure SetCallGlobalProc(P: TFunction);
    function Parse(S: String): String;
    function Calculate(S: String; var R: TVar): Boolean;
    function Execute(S: String): Boolean;
    procedure DisableInteractiveFunctions;
    procedure EnableInteractiveFunctions;
  private
    Expr: String;
    ExprIndex: integer;
    Token: String;
    TokenCode: TToken;

    BlockLevel: integer;
    BlockCmd: TToken;
    GotoLabel: String;

    VarList:  TDictionary<String, Variant>;
    FuncList: TDictionary<String, TFunc>;
    ProcList: TDictionary<String, TProcedure>;

    FInteractiveFunctionsEnabled: Boolean;

    // âíåøíèå ôóíêöèè
    IdleProc: PIdleProc;
    CallGlobalProc: TFunction;

    LastString: String;
    LastParsed: String;

    procedure Clear;
    procedure Process;
    procedure Error(Msg, Line: String; Code: integer);
    procedure Level1(var R: TVar);
    procedure Level2(var R: TVar);
    procedure Level3(var R: TVar);
    procedure Level4(var R: TVar);
    procedure Level5(var R: TVar);
    procedure Level6(var R: TVar);
    procedure Level7(var R: TVar);
    procedure Level8(var R: TVar);
    procedure Arith(o: TToken; var R, H: TVar);
    procedure Unary(o: TToken; var R: TVar);
    function GetIndex(S: String; var Index: integer; var T: TToken): String;
    function GetFuncParams(S: String; var Index: integer): String;
    function FindArray(const N: String): Boolean;
    procedure SetVarDirect(const R: TVar);
    function CallFunc(const FuncName: String; ParamString: String; var V: TVar): Boolean;
    function CallProc(ProcName: String; ParamString: String; var V: TVar): Boolean;
    function GetTextToken(S: String; var Index: integer; var Code: TToken): String;
    function TokenStr(T: TToken; S: String): String;
    function GetToken(S: String; var Index: integer; var Code: TToken): String;
    function GetTokenCode(S: String; var Index: integer; var Code: TToken): integer;
    function GetTokenLine(S: String; var Index: integer; var Code: TToken;
      StopToken: TTokenSet): String;
    function NextToken(S: String; Index: integer): TToken;
    function GetOperator(Txt: String; var Index: integer; EndToken: TTokenSet): String;
    function ParseOperator(Txt: String; var Cmd, Line, Lbl: String): TToken;
    function DelRemarks(S: String): String;
    function UnParse(S: String; Show: Boolean): String;
    function PreProcess(Txt: String): String;
    function Calc(S: String; var R: TVar): Boolean;
    procedure Exec(Txt: String);
    procedure DoSet(CmdLine, Cmd, Line: String);
    procedure DoIf(CmdLine, Line: String);
    procedure DoBegin(CmdLine, Line: String);
    procedure DoFor(CmdLine, Line: String);
    procedure DoBreak(CmdLine, Line: String);
    procedure DoContinue(CmdLine, Line: String);
    procedure DoExit(CmdLine, Line: String);
    procedure DoWhile(CmdLine, Line: String);
    procedure DoRepeat(CmdLine, Line: String);
    procedure DoGoto(CmdLine, Line: String);
    procedure DoCase(CmdLine, Line: String);

    procedure SetFunctions;
    function FuncShowMessage(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncLog(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncFloatToStr(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncIntToStr(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncStrToFloat(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncStrToInt(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncHexToInt(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncValCompat(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncCopy(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncPos(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncLength(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncInsert(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncDelete(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncTrim(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncTrimLeft(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncTrimRight(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncUpperCase(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncLowerCase(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncFormat(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncRequestNumbers(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncDateToStr(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncStrToDate(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncFormatDateTime(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncNow(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncDate(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncTime(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncStrToTime(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncTimeToStr(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncDayOfWeek(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncIncMonth(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncDecodeDate(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncDecodeTime(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncEncodeDate(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncEncodeTime(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncSin(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncCos(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncTan(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncArcSin(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncArcCos(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncArcTan(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncArcTan2(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncExp(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncLn(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncIntPower(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncSqr(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncSqrt(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncAbs(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncInt(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncFrac(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncRound(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncTrunc(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncCeil(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncFloor(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncMax(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncMin(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncInc(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncDec(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncSetVar(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncGetVar(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncVarExists(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncRandom(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncCallGlobal(Vars: TList<TVar>; var Res: TVar): Boolean;
    function FuncGetTickCount(Vars: TList<TVar>; var Res: TVar): Boolean;

  public
    Stop: Boolean;
    ErrCode: integer;
    ErrMsg: String;
    ErrLine: String;
  end;

//procedure SetFunctions(Script: TScript);

procedure ExecuteScript(Text: String);
begin
  if Text = '' then
    Exit;
  {$IFNDEF PAS2JS}
  Calc.Execute(Text);
  if Calc.ErrCode <> 0 then
    raise Exception.Create(Calc.ErrMsg + ': ''' + Calc.ErrLine + '''');
  {$ENDIF}
end; // ExecuteScript

function CalcExpression(Text: String; Default: extended = 0): extended;
{$IFNDEF PAS2JS}
var V: TVar;
{$ENDIF}
begin
  Result := Default;
  if Text = '' then Exit;
  {$IFDEF PAS2JS}
  try
    Result := JS.toNumber(BrowserEval(Text));
  except
    Result := Default;
  end;
  {$ELSE}
  ExecuteScript('Result := ' + Text);
  if Calc.VarByName('Result', V) then
    Result := ScriptToFloat(V.Value);
  {$ENDIF}
end; // CalcExpression

initialization

  Calc := TScript.Create;

{$IFNDEF PAS2JS}
finalization
  Calc.Free;
{$ENDIF}
end.

