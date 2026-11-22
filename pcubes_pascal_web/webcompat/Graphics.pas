unit Graphics;
{$mode objfpc}{$H+}
{ Minimal TColor compatibility for non-visual model code; not a drawing API. }
interface
type TColor = LongInt;
const
  clBlack=TColor($00000000); clWhite=TColor($00FFFFFF);
  clRed=TColor($000000FF); clGreen=TColor($00008000);
  clBlue=TColor($00FF0000); clGray=TColor($00808080);
function RGB(R,G,B:Byte):TColor; inline;
function ColorToRGB(Color:TColor):DWord; inline;
function GetRValue(ColorRef:DWord):Byte; inline;
function GetGValue(ColorRef:DWord):Byte; inline;
function GetBValue(ColorRef:DWord):Byte; inline;
implementation
function RGB(R,G,B:Byte):TColor;
begin Result:=TColor(DWord(R) or (DWord(G) shl 8) or (DWord(B) shl 16)); end;
function ColorToRGB(Color:TColor):DWord;
begin Result:=DWord(Color); end;
function GetRValue(ColorRef:DWord):Byte;
begin Result:=Byte(ColorRef and $FF); end;
function GetGValue(ColorRef:DWord):Byte;
begin Result:=Byte((ColorRef shr 8) and $FF); end;
function GetBValue(ColorRef:DWord):Byte;
begin Result:=Byte((ColorRef shr 16) and $FF); end;
end.